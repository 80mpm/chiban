#!/usr/bin/env python3
"""登記所備付地図データ（台東区・全図面）→ PostgreSQL 筆マスタシード生成ツール。

kouzu/13106-0105-2026/ 内の全 zip（144 図面）を読み、筆ポリゴンを緯度経度化して
kouzu_parcels_seed.json.gz を生成する。db.py が parcels テーブルのシード元に使う。

座標の扱い:
    - 公共座標9系の図面（4 図面）: 平面直角座標系第IX系 → JGD2011 緯度経度へ厳密変換
    - 任意座標系の図面（140 図面）: 形状・縮尺は正確だが絶対位置を持たないため、
      図面の重心を「大字・丁目の代表点」へ平行移動する近似ジオリファレンスで配置する
      （properties.approx = true）。代表点は Nominatim で大字・丁目をジオコーディングして
      取得し、tools/kouzu_anchors.json にキャッシュする（再実行時はネットワーク不要）。
      西浅草2丁目（13106-0105-65）のみ、既存サンプルデータとの整合のため
      convert_kouzu_xml.py の固定アンカーを使う。

近似配置の前提は既存の西浅草2丁目と同じ（北上・メートル単位・平行移動のみ）。
土地ポリゴンは地図に重ねない設計のため、絶対位置の精度は問題にならない
（公図風ビューの相対形状と面積計算にのみ使う）。

使い方:
    .venv/bin/python tools/convert_kouzu_seed.py
"""

import gzip
import json
import math
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import convert_kouzu_xml as ck  # 既存コンバータの XML パース・座標変換を再利用

REPO = Path(__file__).resolve().parent.parent
SRC_DIR = REPO / 'kouzu' / '13106-0105-2026'
OUT = REPO / 'kouzu_parcels_seed.json.gz'
ANCHOR_CACHE = Path(__file__).resolve().parent / 'kouzu_anchors.json'

NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
USER_AGENT = 'chiban-demo-seed-tool (one-time batch geocoding, 1 req/sec)'


# ---------- 大字・丁目の代表点（Nominatim + ファイルキャッシュ） ----------

def load_anchor_cache():
    if ANCHOR_CACHE.exists():
        return json.loads(ANCHOR_CACHE.read_text(encoding='utf-8'))
    return {}


def save_anchor_cache(cache):
    ANCHOR_CACHE.write_text(
        json.dumps(cache, ensure_ascii=False, indent=1, sort_keys=True) + '\n',
        encoding='utf-8',
    )


_last_request = [0.0]


def geocode_town(town, cache):
    """「東京都台東区{大字}{丁目}」の代表点 (lat, lon) を返す。キャッシュ優先・1 req/sec。"""
    if town in cache:
        v = cache[town]
        return tuple(v) if v else None

    query = f'東京都台東区{town}'
    params = urllib.parse.urlencode({
        'format': 'json', 'limit': 1, 'accept-language': 'ja', 'q': query,
    })
    wait = 1.1 - (time.time() - _last_request[0])  # Nominatim のレート制限 1 req/sec を厳守
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(f'{NOMINATIM_URL}?{params}', headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            results = json.loads(resp.read().decode())
    finally:
        _last_request[0] = time.time()

    anchor = None
    if results:
        anchor = (float(results[0]['lat']), float(results[0]['lon']))
    cache[town] = list(anchor) if anchor else None
    save_anchor_cache(cache)  # 途中失敗してもここまでの結果を残す
    return anchor


# ---------- 図面 1 枚の変換 ----------

def dominant_town(parcels):
    """図面内で最頻の (大字, 丁目)。図面のアンカー検索キーに使う。"""
    c = Counter((p['oaza'], p['chome']) for p in parcels if p['oaza'])
    if not c:
        return None
    oaza, chome = c.most_common(1)[0][0]
    return f'{oaza}{chome}'


def ring_to_lonlat_public(ring):
    return [[round(lon, 8), round(lat, 8)]
            for lat, lon in (ck.xy_to_latlon(x, y) for x, y in ring)]


def ring_to_lonlat_approx(ring, cx, cy, lat0, lon0):
    m_per_lat = 111320.0
    m_per_lon = 111320.0 * math.cos(math.radians(lat0))
    return [[round(lon0 + (y - cy) / m_per_lon, 8),
             round(lat0 + (x - cx) / m_per_lat, 8)] for x, y in ring]


def convert_sheet(stem, anchor_cache, warnings):
    """zip 1 枚 → (sheet_meta, parcel_rows)。配置できない図面は (meta, []) を返す。"""
    with zipfile.ZipFile(SRC_DIR / f'{stem}.zip') as zf:
        xml_name = next(n for n in zf.namelist() if n.endswith('.xml'))
        xml_bytes = zf.read(xml_name)
    sheet_name, parcels = ck.parse_sheet(xml_bytes, require_public=False)

    # 標準地番（数字 / 数字-数字）のみ。道・水路等の特殊筆は土地として扱わない。
    # 同じ地番が図面内に複数あっても除外しない（丁目をまたぐ図面では正当に共存する。
    # 筆の同一性は DB のサロゲートキーが担うため、ここで一意化する必要はない）
    targets = [p for p in parcels if ck.is_standard_chiban(p['chiban']) and len(p['ring']) >= 4]

    is_public = stem in ck.SHEETS  # 公共座標9系の 4 図面
    town = dominant_town(targets)
    meta = {'id': stem, 'name': sheet_name, 'count': len(targets),
            'approx': not is_public, 'town': town}

    if not targets:
        return meta, []

    if is_public:
        rows = [(p, ring_to_lonlat_public(p['ring'])) for p in targets]
    else:
        # 任意座標系: 図面重心を大字・丁目の代表点へ平行移動
        if stem == ck.APPROX_SHEET:
            anchor = ck.APPROX_ANCHOR  # 西浅草2丁目は既存サンプルと同じ固定アンカー
        else:
            if not town:
                warnings.append(f'{stem}: 大字名が取れないため配置できず除外')
                return meta, []
            anchor = geocode_town(town, anchor_cache)
            if not anchor:
                warnings.append(f'{stem}: 「{town}」のジオコーディング失敗のため除外')
                return meta, []
        all_pts = [pt for p in targets for pt in p['ring']]
        cx = sum(pt[0] for pt in all_pts) / len(all_pts)  # X = 北
        cy = sum(pt[1] for pt in all_pts) / len(all_pts)  # Y = 東
        rows = [(p, ring_to_lonlat_approx(p['ring'], cx, cy, anchor[0], anchor[1]))
                for p in targets]

    # ID は持たせない（DB 投入時にサロゲートキーが振られる）。図面・町名・地番はただの属性
    parcel_rows = [{
        'sheetId': stem,
        'oaza': p['oaza'],
        'chome': p['chome'],
        'chiban': p['chiban'],
        'approx': not is_public,
        'geometry': {'type': 'Polygon', 'coordinates': [ring]},
    } for p, ring in rows]
    return meta, parcel_rows


def main():
    stems = sorted(zp.stem for zp in SRC_DIR.glob('*.zip'))
    if not stems:
        sys.exit(f'エラー: {SRC_DIR} に zip が見つかりません')

    anchor_cache = load_anchor_cache()
    n_cached = sum(1 for v in anchor_cache.values() if v)
    print(f'{len(stems)} 図面を変換します（アンカーキャッシュ: {n_cached} 町名）')

    sheets_meta = []
    all_parcels = []
    warnings = []
    for i, stem in enumerate(stems, 1):
        meta, rows = convert_sheet(stem, anchor_cache, warnings)
        sheets_meta.append(meta)
        all_parcels.extend(rows)
        kind = '公共座標9系' if not meta['approx'] else f"近似配置 ({meta['town']})"
        print(f'[{i:3}/{len(stems)}] {stem}: {meta["count"]:4} 筆 — {kind}')

    data = {
        'source': '登記所備付地図データ（法務省 / G空間情報センター）台東区 2026年版・全図面',
        'crs': '公共座標9系は JGD2011 緯度経度へ厳密変換 / 任意座標系は町代表点への近似配置（approx: true）',
        'sheets': sheets_meta,
        'parcels': all_parcels,
    }
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with gzip.open(OUT, 'wb', compresslevel=9) as f:
        f.write(raw)

    n_public = sum(1 for p in all_parcels if not p['approx'])
    print(f'\n書き出し: {OUT}')
    print(f'  {len(all_parcels):,} 筆（公共座標 {n_public:,} / 近似配置 {len(all_parcels) - n_public:,}）')
    print(f'  raw {len(raw):,} bytes → gz {OUT.stat().st_size:,} bytes')
    if warnings:
        print('\n警告:')
        for w in warnings:
            print(f'  - {w}')


if __name__ == '__main__':
    main()
