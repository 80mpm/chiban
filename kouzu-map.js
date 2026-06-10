// ============================================================
// 登記所備付地図ビューア（kouzu-map.html）
// kouzu_xml_data.js（地図XML から変換した GeoJSON）を ZENRIN 地図に重ねる。
// 図面ごとのレイヤー切替・筆クリックで右パネルに登記属性を表示する。
// ============================================================
(() => {
  'use strict';

  const DATA = window.KOUZU_XML_DATA;
  if (!DATA || !DATA.geojson) return;

  // 図面ごとの表示色（4図面で固定）
  const SHEET_COLORS = ['#2563eb', '#d97706', '#059669', '#db2777'];

  // 地番ラベルを表示する最小ズーム（引きで見たときの文字潰れ防止）
  const LABEL_MIN_ZOOM = 17;

  const map = L.map('map', {
    zoomControl: true,
    maxZoom: 22,
    attributionControl: false,
  });
  L.tileLayer('/tile/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(map);

  // ---------- 図面ごとの表示名 ----------
  // 142/143 は地図名がそのまま使えるが、140/141 は機械的な整理名
  // （例: 10148_hosei_...）なので、筆の所在から表示名を組み立てる。
  function sheetDisplayName(sheet, features) {
    if (!/^\d+_/.test(sheet.name)) return sheet.name;
    const f = features.find((ft) => ft.properties.sheetId === sheet.id);
    if (!f) return sheet.name;
    const p = f.properties;
    return `台東区${p.oaza}${p.chome}地区`;
  }

  // ---------- レイヤー構築 ----------
  const features = DATA.geojson.features;
  const sheetLayers = new Map(); // sheetId → { layer, color, bounds }
  let selectedPath = null;

  DATA.sheets.forEach((sheet, idx) => {
    const color = SHEET_COLORS[idx % SHEET_COLORS.length];
    const layer = L.geoJSON(
      { type: 'FeatureCollection', features: features.filter((f) => f.properties.sheetId === sheet.id) },
      {
        style: () => ({ color, weight: 1.5, fillColor: color, fillOpacity: 0.18 }),
        onEachFeature: (feature, path) => {
          path.bindTooltip(feature.properties.chiban, {
            permanent: true,
            direction: 'center',
            className: 'map-label label-chiban',
          });
          if (path.getTooltip()) {
            path.getTooltip().options.interactive = false;
          }
          path.on('click', () => selectParcel(feature, path, color));
          path.on('mouseover', () => { if (path !== selectedPath) path.setStyle({ fillOpacity: 0.4 }); });
          path.on('mouseout', () => { if (path !== selectedPath) path.setStyle({ fillOpacity: 0.18 }); });
        },
      }
    );
    layer.addTo(map);
    sheetLayers.set(sheet.id, { sheet, layer, color, bounds: layer.getBounds() });
  });

  // 全図面が収まる範囲に初期表示
  const allBounds = [...sheetLayers.values()]
    .map((s) => s.bounds)
    .reduce((acc, b) => (acc ? acc.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast())), null);
  if (allBounds) map.fitBounds(allBounds, { padding: [32, 32] });

  // ---------- ズームに応じた地番ラベルの表示切替 ----------
  function updateLabels() {
    const show = map.getZoom() >= LABEL_MIN_ZOOM;
    document.querySelectorAll('.map-label').forEach((el) => {
      el.style.display = show ? '' : 'none';
    });
  }
  map.on('zoomend', updateLabels);
  map.whenReady(updateLabels);

  // ---------- サイドパネル: 図面レイヤー一覧 ----------
  const sheetListEl = document.getElementById('sheet-list');
  sheetLayers.forEach(({ sheet, layer, color, bounds }) => {
    const row = document.createElement('div');
    row.className = 'sheet-row';
    row.style.color = color;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      if (cb.checked) { layer.addTo(map); updateLabels(); }
      else map.removeLayer(layer);
    });

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = color + '33';

    const nameWrap = document.createElement('span');
    nameWrap.className = 'sheet-name';
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = sheetDisplayName(sheet, features);
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = `図面: ${sheet.name}${sheet.approx ? '（任意座標系・位置は概算）' : ''}`;
    nameWrap.append(nm, sub);

    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = `${sheet.count}筆`;

    row.append(cb, swatch, nameWrap, count);
    // 行クリックでその図面の範囲へズーム
    row.addEventListener('click', () => {
      if (!cb.checked) { cb.checked = true; layer.addTo(map); }
      map.fitBounds(bounds, { padding: [40, 40] });
    });
    sheetListEl.appendChild(row);
  });

  // ---------- サイドパネル: 筆の詳細 ----------
  const detailEl = document.getElementById('parcel-detail');

  function selectParcel(feature, path, color) {
    if (selectedPath) selectedPath.setStyle({ weight: 1.5, fillOpacity: 0.18 });
    selectedPath = path;
    path.setStyle({ weight: 3, fillOpacity: 0.45 });

    const p = feature.properties;
    const rows = [
      ['地番', p.chiban, 'big'],
      ['所在', `台東区${p.oaza}${p.chome || ''}`],
      ['図面名', p.sheetName],
      ['精度区分', p.precision || '—'],
      ['座標値種別', p.coordType || '—'],
      ['座標系', DATA.crs],
    ];
    const grid = document.createElement('div');
    grid.className = 'parcel-meta';
    rows.forEach(([label, value, cls]) => {
      const l = document.createElement('div');
      l.className = 'label';
      l.textContent = label;
      const v = document.createElement('div');
      v.className = 'value' + (cls ? ` ${cls}` : '');
      v.textContent = value;
      v.style.color = cls === 'big' ? color : '';
      grid.append(l, v);
    });
    detailEl.replaceChildren(grid);
  }
})();
