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
OUT = REPO / 'packages' / 'shared' / 'data' / 'kouzu_parcels_seed.json.gz'
ANCHOR_CACHE = Path(__file__).resolve().parent / 'kouzu_anchors.json'

# 配置アルゴリズムを変えたらこの版を上げる（既存 DB のジオメトリが更新される）
LAYOUT_VERSION = 'anchor-packed-v2'

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


def load_sheet(stem):
    """zip 1 枚を読み、土地として扱う筆（標準地番のみ）とメタ情報を返す。配置はまだしない。"""
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
    return meta, targets, is_public


def sheet_extent(targets):
    """図面重心を原点とするローカル平面メートル座標での範囲 (幅X=北, 幅Y=東) と重心。"""
    all_pts = [pt for p in targets for pt in p['ring']]
    cx = sum(pt[0] for pt in all_pts) / len(all_pts)  # X = 北
    cy = sum(pt[1] for pt in all_pts) / len(all_pts)  # Y = 東
    xs = [pt[0] - cx for pt in all_pts]
    ys = [pt[1] - cy for pt in all_pts]
    return (cx, cy), (min(xs), max(xs), min(ys), max(ys))


def layout_anchor_group(group, fixed=(), gap=15.0):
    """同一アンカー（大字・丁目の代表点）へ置く図面群の配置オフセットを決める。

    任意座標系の図面は図面ごとに独立した原点を持ち、図面どうしの相対位置はデータから
    復元できない（同じ町の隣接図面でも境界の頂点座標が一致しないことを確認済み）。
    そのため図面ごとに「自分の重心をアンカーへ重ねる」と、同じ町に属する複数の図面が
    真上に積み重なり、筆どうしが交差して描画される（公図では筆は重ならないので明確な不具合）。

    ここでは重なりを避けるため、図面を東西（Y）方向に一列に並べ、列全体の中心が
    アンカーへ来るよう平行移動する。図面内の形状・縮尺は一切変えない。
    並び順は図面 ID 順（おおむね地図番号順）とし、現実の隣接関係に近づける。

    fixed には同じ町にある公共座標9系の図面（実測位置なので動かせない）の占有範囲を渡す。
    上野３丁目・秋葉原・根岸３丁目は任意座標系の図面と公共座標9系の図面が同居しており、
    代表点へ寄せると実測位置の図面に重なるため、任意座標系の図面はその東隣から並べる。

    group: [(stem, (minX, maxX, minY, maxY)), ...]（アンカー基準・動かせる図面）
    fixed: [(minX, maxX, minY, maxY), ...]（アンカー基準・動かせない図面）
    → {stem: (dx, dy)}（dx = 北方向, dy = 東方向のメートル）
    """
    if not group:
        return {}
    if len(group) == 1 and not fixed:
        stem, _ = group[0]
        return {stem: (0.0, 0.0)}

    ordered = sorted(group, key=lambda g: g[0])
    widths = [box[3] - box[2] for _, box in ordered]  # 東西方向の幅
    total = sum(widths) + gap * (len(ordered) - 1)

    if fixed:
        cursor = max(f[3] for f in fixed) + gap           # 実測図面の東端の外側から
        north_center = sum((f[0] + f[1]) / 2 for f in fixed) / len(fixed)
    else:
        cursor = -total / 2                               # 列全体の中心をアンカーへ
        north_center = 0.0

    offsets = {}
    for (stem, box), w in zip(ordered, widths):
        # 図面のローカル座標はすでに重心原点。箱の左端を cursor に合わせる
        offsets[stem] = (north_center - (box[0] + box[1]) / 2, cursor - box[2])
        cursor += w + gap
    return offsets


def anchor_box(rings, anchor):
    """緯度経度のリング群 → アンカー基準のローカル平面メートル範囲 (minX, maxX, minY, maxY)。

    公共座標9系の図面が同じ町のどこを占有しているかを、任意座標系の図面と同じ
    座標系（X = 北・Y = 東のメートル）で表すために使う。
    """
    lat0, lon0 = anchor
    m_per_lat = 111320.0
    m_per_lon = 111320.0 * math.cos(math.radians(lat0))
    xs = [(lat - lat0) * m_per_lat for ring in rings for lon, lat in ring]
    ys = [(lon - lon0) * m_per_lon for ring in rings for lon, lat in ring]
    return (min(xs), max(xs), min(ys), max(ys))


def place_approx(targets, center, anchor, offset):
    """任意座標系の図面を、アンカー + 配置オフセットの位置へ平行移動して緯度経度化する。"""
    cx, cy = center
    dx, dy = offset
    return [ring_to_lonlat_approx(p['ring'], cx - dx, cy - dy, anchor[0], anchor[1])
            for p in targets]


def resolve_anchor(stem, town, anchor_cache, warnings):
    """図面の配置アンカー (lat, lon) を返す。決められなければ None。"""
    if stem == ck.APPROX_SHEET:
        return ck.APPROX_ANCHOR  # 西浅草2丁目は既存サンプルと同じ固定アンカー
    if not town:
        warnings.append(f'{stem}: 大字名が取れないため配置できず除外')
        return None
    anchor = geocode_town(town, anchor_cache)
    if not anchor:
        warnings.append(f'{stem}: 「{town}」のジオコーディング失敗のため除外')
    return anchor


def parcel_rows(stem, targets, rings, is_public):
    # ID は持たせない（DB 投入時にサロゲートキーが振られる）。図面・町名・地番はただの属性
    return [{
        'sheetId': stem,
        'oaza': p['oaza'],
        'chome': p['chome'],
        'chiban': p['chiban'],
        'approx': not is_public,
        'geometry': {'type': 'Polygon', 'coordinates': [ring]},
    } for p, ring in zip(targets, rings)]


def main():
    stems = sorted(zp.stem for zp in SRC_DIR.glob('*.zip'))
    if not stems:
        sys.exit(f'エラー: {SRC_DIR} に zip が見つかりません')

    anchor_cache = load_anchor_cache()
    n_cached = sum(1 for v in anchor_cache.values() if v)
    print(f'{len(stems)} 図面を変換します（アンカーキャッシュ: {n_cached} 町名）')

    warnings = []
    sheets_meta = []
    loaded = {}        # stem → (targets, is_public)
    public_rings = {}  # stem → 公共座標9系の緯度経度リング
    approx_group = {}  # アンカー → [(stem, box)]（動かせる図面）
    fixed_boxes = {}   # アンカー → [box]（同じ町にある公共座標9系の占有範囲）
    anchors = {}       # stem → (lat, lon)
    centers = {}       # stem → 図面重心（ローカル座標の原点）

    for i, stem in enumerate(stems, 1):
        meta, targets, is_public = load_sheet(stem)
        sheets_meta.append(meta)
        if not targets:
            print(f'[{i:3}/{len(stems)}] {stem}: 0 筆 — 対象なし')
            continue
        loaded[stem] = (targets, is_public)
        if is_public:
            # 実測位置。動かさないが、同じ町の任意座標系図面が重ならないよう占有範囲を控える
            rings = [ring_to_lonlat_public(p['ring']) for p in targets]
            public_rings[stem] = rings
            anchor = geocode_town(meta['town'], anchor_cache) if meta['town'] else None
            if anchor:
                fixed_boxes.setdefault(anchor, []).append(anchor_box(rings, anchor))
            print(f'[{i:3}/{len(stems)}] {stem}: {meta["count"]:4} 筆 — 公共座標9系')
            continue
        anchor = resolve_anchor(stem, meta['town'], anchor_cache, warnings)
        if not anchor:
            del loaded[stem]
            print(f'[{i:3}/{len(stems)}] {stem}: {meta["count"]:4} 筆 — 配置できず除外')
            continue
        center, box = sheet_extent(targets)
        anchors[stem] = anchor
        centers[stem] = center
        approx_group.setdefault(anchor, []).append((stem, box))
        print(f'[{i:3}/{len(stems)}] {stem}: {meta["count"]:4} 筆 — 近似配置 ({meta["town"]})')

    # 同一アンカーに複数図面が来る町は、重ならないよう一列に並べる
    offsets = {}
    for anchor, group in approx_group.items():
        offsets.update(layout_anchor_group(group, fixed_boxes.get(anchor, ())))
    n_towns = sum(1 for a, g in approx_group.items() if len(g) > 1 or fixed_boxes.get(a))
    n_sheets = sum(len(g) for a, g in approx_group.items() if len(g) > 1 or fixed_boxes.get(a))
    print(f'\n同一アンカーに図面が重なる町: {n_towns} 町 / {n_sheets} 図面を並置')

    all_parcels = []
    for stem in stems:
        if stem not in loaded:
            continue
        targets, is_public = loaded[stem]
        if is_public:
            rings = public_rings[stem]
        else:
            rings = place_approx(targets, centers[stem], anchors[stem], offsets[stem])
        all_parcels.extend(parcel_rows(stem, targets, rings, is_public))

    data = {
        'source': '登記所備付地図データ（法務省 / G空間情報センター）台東区 2026年版・全図面',
        'crs': '公共座標9系は JGD2011 緯度経度へ厳密変換 / 任意座標系は町代表点への近似配置'
               '（approx: true。同一町に複数図面がある場合は重ならないよう東西に並置）',
        # 配置アルゴリズムの版。既存 DB の筆ジオメトリを更新すべきかの判定に使う
        # （packages/shared/lib/db/seed-parcels.ts の refreshParcelGeometryIfStale）
        'layout': LAYOUT_VERSION,
        'sheets': sheets_meta,
        'parcels': all_parcels,
    }
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    # git 管理するため mtime を 0 に固定し、内容が同じなら同一バイト列になるようにする
    with open(OUT, 'wb') as fo, gzip.GzipFile(fileobj=fo, mode='wb', compresslevel=9, mtime=0) as f:
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
