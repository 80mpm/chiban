#!/usr/bin/env python3
"""登記所備付地図データ（地図XML）→ GeoJSON 変換ツール。

kouzu/13106-0105-2026/ 内の公共座標9系の4図面（140〜143）を読み、
平面直角座標系第IX系の座標を JGD2011 の緯度経度へ逆変換して
kouzu_xml_data.js（window.KOUZU_XML_DATA に GeoJSON を格納）を生成する。

座標変換は国土地理院「Gauss-Krüger 投影における経緯度の計算」
（河瀬 2011）の級数展開式を実装。外部ライブラリ不要。

使い方:
    python3 tools/convert_kouzu_xml.py
"""

import json
import math
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC_DIR = REPO / 'kouzu' / '13106-0105-2026'
SHEETS = ['13106-0105-140', '13106-0105-141', '13106-0105-142', '13106-0105-143']
OUT = REPO / 'kouzu_xml_data.js'

# ---- 任意座標系図面からの近似抽出（西浅草2丁目・全筆） ----
# 西浅草2丁目の図面（任意座標系）はメートル単位で形状・縮尺は正確だが絶対位置を持たない。
# 北上（X=北 / Y=東）を仮定し、図面全体の重心を町の代表点へ平行移動するだけの
# 近似ジオリファレンスで緯度経度化する。土地ポリゴンは地図に重ねない設計のため、
# 絶対位置の精度は問題にならない（公図風ビューの相対形状と面積計算にのみ使う）。
APPROX_SHEET = '13106-0105-65'
APPROX_ANCHOR = (35.712406, 139.789297)  # 西浅草2丁目の代表点（新東京旅館の案件領域の重心）

# 筆マスタとして収録する標準形式（数字 / 数字-数字）。
# 道・水路・合併・筆界未定（W/X等）などの長狭物・特殊筆は土地として扱わないため除外する。
STANDARD_CHIBAN_RE = re.compile(r'^[0-9０-９]+(-[0-9０-９]+)?$')

NS = {
    'mj': 'http://www.moj.go.jp/MINJI/tizuxml',
    'zmn': 'http://www.moj.go.jp/MINJI/tizuzumen',
}

# ---- 平面直角座標系第IX系（JGD2011 / GRS80）→ 緯度経度 ----

A_RADIUS = 6378137.0          # GRS80 長半径
F_INV = 298.257222101         # GRS80 扁平率の逆数
M0 = 0.9999                   # 縮尺係数
LAT0 = math.radians(36.0)             # 第IX系 原点緯度
LON0 = math.radians(139.0 + 50.0 / 60.0)  # 第IX系 原点経度 139°50′

_n = 1.0 / (2.0 * F_INV - 1.0)

_A = [
    1 + _n**2 / 4 + _n**4 / 64,
    -3.0 / 2 * (_n - _n**3 / 8 - _n**5 / 64),
    15.0 / 16 * (_n**2 - _n**4 / 4),
    -35.0 / 48 * (_n**3 - 5.0 / 16 * _n**5),
    315.0 / 512 * _n**4,
    -693.0 / 1280 * _n**5,
]
_BETA = [
    1.0 / 2 * _n - 2.0 / 3 * _n**2 + 37.0 / 96 * _n**3 - 1.0 / 360 * _n**4 - 81.0 / 512 * _n**5,
    1.0 / 48 * _n**2 + 1.0 / 15 * _n**3 - 437.0 / 1440 * _n**4 + 46.0 / 105 * _n**5,
    17.0 / 480 * _n**3 - 37.0 / 840 * _n**4 - 209.0 / 4480 * _n**5,
    4397.0 / 161280 * _n**4 - 11.0 / 504 * _n**5,
    4583.0 / 161280 * _n**5,
]
_DELTA = [
    2 * _n - 2.0 / 3 * _n**2 - 2 * _n**3 + 116.0 / 45 * _n**4 + 26.0 / 45 * _n**5 - 2854.0 / 675 * _n**6,
    7.0 / 3 * _n**2 - 8.0 / 5 * _n**3 - 227.0 / 45 * _n**4 + 2704.0 / 315 * _n**5 + 2323.0 / 945 * _n**6,
    56.0 / 15 * _n**3 - 136.0 / 35 * _n**4 - 1262.0 / 105 * _n**5 + 73814.0 / 2835 * _n**6,
    4279.0 / 630 * _n**4 - 332.0 / 35 * _n**5 - 399572.0 / 14175 * _n**6,
    4174.0 / 315 * _n**5 - 144838.0 / 6237 * _n**6,
    601676.0 / 22275 * _n**6,
]

_A_BAR = M0 * A_RADIUS / (1 + _n) * _A[0]
_S_PHI0 = M0 * A_RADIUS / (1 + _n) * (
    _A[0] * LAT0 + sum(_A[i] * math.sin(2 * i * LAT0) for i in range(1, 6))
)


def xy_to_latlon(x, y):
    """地図XMLの X(北向き)・Y(東向き) [m] を (緯度, 経度) [度] に変換する。"""
    xi = (x + _S_PHI0) / _A_BAR
    eta = y / _A_BAR
    xi2 = xi - sum(_BETA[i - 1] * math.sin(2 * i * xi) * math.cosh(2 * i * eta) for i in range(1, 6))
    eta2 = eta - sum(_BETA[i - 1] * math.cos(2 * i * xi) * math.sinh(2 * i * eta) for i in range(1, 6))
    chi = math.asin(math.sin(xi2) / math.cosh(eta2))
    lat = chi + sum(_DELTA[i - 1] * math.sin(2 * i * chi) for i in range(1, 7))
    lon = LON0 + math.atan2(math.sinh(eta2), math.cos(xi2))
    return math.degrees(lat), math.degrees(lon)


# ---- 地図XML パース ----

def text(el, tag):
    child = el.find(f'mj:{tag}', NS)
    return child.text.strip() if child is not None and child.text else ''


def parse_sheet(xml_bytes, require_public=True):
    root = ET.fromstring(xml_bytes)
    sheet_name = text(root, '地図名')
    coord_sys = text(root, '座標系')
    if require_public and '公共座標' not in coord_sys:
        raise ValueError(f'{sheet_name}: 公共座標系ではない ({coord_sys})')

    spatial = root.find('mj:空間属性', NS)

    points = {}
    for pt in spatial.findall('zmn:GM_Point', NS):
        pos = pt.find('.//zmn:DirectPosition', NS)
        x = float(pos.find('zmn:X', NS).text)
        y = float(pos.find('zmn:Y', NS).text)
        points[pt.get('id')] = (x, y)

    curves = {}
    for cv in spatial.findall('zmn:GM_Curve', NS):
        coords = []
        for col in cv.findall('.//zmn:GM_PointArray.column', NS):
            ref = col.find('.//zmn:GM_PointRef.point', NS)
            if ref is not None:
                coords.append(points[ref.get('idref')])
                continue
            pos = col.find('.//zmn:DirectPosition', NS)
            if pos is not None:
                coords.append((float(pos.find('zmn:X', NS).text),
                               float(pos.find('zmn:Y', NS).text)))
        curves[cv.get('id')] = coords

    surfaces = {}
    for sf in spatial.findall('zmn:GM_Surface', NS):
        ring_ids = [g.get('idref') for g in sf.findall(
            './/zmn:GM_SurfaceBoundary.exterior//zmn:GM_CompositeCurve.generator', NS)]
        surfaces[sf.get('id')] = ring_ids

    parcels = []
    for fude in root.findall('.//mj:筆', NS):
        shape = fude.find('mj:形状', NS)
        if shape is None:
            continue
        surface_id = shape.get('idref')
        if surface_id not in surfaces:
            continue
        ring = chain_curves([curves[cid] for cid in surfaces[surface_id] if cid in curves])
        if len(ring) < 3:
            continue
        parcels.append({
            'oaza': text(fude, '大字名'),
            'chome': text(fude, '丁目名'),
            'chiban': text(fude, '地番'),
            'precision': text(fude, '精度区分'),
            'coordType': text(fude, '座標値種別'),
            'ring': ring,
        })
    return sheet_name, parcels


def chain_curves(curve_list):
    """構成曲線を端点の一致で連結して 1 本の外周リングにする。"""
    ring = []
    for coords in curve_list:
        if not coords:
            continue
        if not ring:
            ring.extend(coords)
            continue
        last = ring[-1]
        if coords[0] == last:
            ring.extend(coords[1:])
        elif coords[-1] == last:
            ring.extend(reversed(coords[:-1]))
        elif coords[-1] == ring[0]:
            # リング先頭側に繋がる曲線（順序逆転）はそのまま先頭へ
            ring[0:0] = coords[:-1]
        else:
            ring.extend(coords)
    if ring and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def is_standard_chiban(chiban):
    return bool(STANDARD_CHIBAN_RE.match(chiban))


def parcel_id(sheet_id, chiban):
    """筆マスタの安定 ID。図面 ID + 地番で全筆を一意に識別する。"""
    return f'{sheet_id}:{chiban}'


def convert_approx_sheet(features, sheets_meta):
    """任意座標系の西浅草2丁目図面の全筆（標準地番のみ）を近似ジオリファレンスして追加する。"""
    zip_path = SRC_DIR / f'{APPROX_SHEET}.zip'
    with zipfile.ZipFile(zip_path) as zf:
        xml_bytes = zf.read(f'{APPROX_SHEET}.xml')
    sheet_name, parcels = parse_sheet(xml_bytes, require_public=False)
    targets = [p for p in parcels if is_standard_chiban(p['chiban']) and len(p['ring']) >= 4]

    # 図面全体の重心（任意座標系・メートル）→ APPROX_ANCHOR に平行移動
    all_pts = [pt for p in targets for pt in p['ring']]
    cx = sum(pt[0] for pt in all_pts) / len(all_pts)  # X = 北
    cy = sum(pt[1] for pt in all_pts) / len(all_pts)  # Y = 東
    lat0, lon0 = APPROX_ANCHOR
    m_per_lat = 111320.0
    m_per_lon = 111320.0 * math.cos(math.radians(lat0))

    for p in targets:
        ring_lonlat = []
        for (x, y) in p['ring']:
            lat = lat0 + (x - cx) / m_per_lat
            lon = lon0 + (y - cy) / m_per_lon
            ring_lonlat.append([round(lon, 8), round(lat, 8)])
        features.append({
            'type': 'Feature',
            'properties': {
                'parcelId': parcel_id(APPROX_SHEET, p['chiban']),
                'sheetId': APPROX_SHEET,
                'sheetName': sheet_name,
                'oaza': p['oaza'],
                'chome': p['chome'],
                'chiban': p['chiban'],
                'precision': p['precision'],
                'coordType': p['coordType'],
                'approx': True,  # 任意座標系からの近似配置（位置は概算）
            },
            'geometry': {'type': 'Polygon', 'coordinates': [ring_lonlat]},
        })
    sheets_meta.append({'id': APPROX_SHEET, 'name': sheet_name, 'count': len(targets), 'approx': True})
    print(f'{APPROX_SHEET}: {sheet_name} — {len(targets)} 筆（任意座標系・近似配置）')


def main():
    features = []
    sheets_meta = []
    for idx, stem in enumerate(SHEETS):
        zip_path = SRC_DIR / f'{stem}.zip'
        with zipfile.ZipFile(zip_path) as zf:
            xml_bytes = zf.read(f'{stem}.xml')
        sheet_name, parcels = parse_sheet(xml_bytes)
        parcels = [p for p in parcels if is_standard_chiban(p['chiban'])]
        for p in parcels:
            ring_lonlat = []
            for (x, y) in p['ring']:
                lat, lon = xy_to_latlon(x, y)
                ring_lonlat.append([round(lon, 8), round(lat, 8)])
            features.append({
                'type': 'Feature',
                'properties': {
                    'parcelId': parcel_id(stem, p['chiban']),
                    'sheetId': stem,
                    'sheetName': sheet_name,
                    'oaza': p['oaza'],
                    'chome': p['chome'],
                    'chiban': p['chiban'],
                    'precision': p['precision'],
                    'coordType': p['coordType'],
                },
                'geometry': {'type': 'Polygon', 'coordinates': [ring_lonlat]},
            })
        sheets_meta.append({'id': stem, 'name': sheet_name, 'count': len(parcels)})
        print(f'{stem}: {sheet_name} — {len(parcels)} 筆')

    convert_approx_sheet(features, sheets_meta)

    # parcelId の一意性を保証する（同一図面内の地番重複があれば異常）
    ids = [f['properties']['parcelId'] for f in features]
    if len(ids) != len(set(ids)):
        from collections import Counter
        dups = [k for k, v in Counter(ids).items() if v > 1]
        raise ValueError(f'parcelId が重複: {dups[:10]}')

    data = {
        'source': '登記所備付地図データ（法務省 / G空間情報センター）台東区 2026年版',
        'crs': '平面直角座標系第IX系 (JGD2011) から変換',
        'sheets': sheets_meta,
        'geojson': {'type': 'FeatureCollection', 'features': features},
    }
    js = ('// 自動生成ファイル — tools/convert_kouzu_xml.py が生成。手で編集しない\n'
          '// 出典: 登記所備付地図データ（法務省）を G空間情報センターから取得し座標変換\n'
          'window.KOUZU_XML_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    OUT.write_text(js, encoding='utf-8')
    print(f'\n書き出し: {OUT} ({OUT.stat().st_size:,} bytes, {len(features)} 筆)')


if __name__ == '__main__':
    main()
