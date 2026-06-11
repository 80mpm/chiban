// ============================================================
// 案件詳細画面（上部に案件サマリー / 下部に 公図風ビュー(左) + 地図(右) の左右半々）
//   - 本部管理画面の一覧から `detail.html?projectId=...` で遷移する
//   - 左ペインには土地の polygon から自動生成した公図風ビュー（白地・北上の SVG）を描画する
//   - 右ペインは Leaflet マップ（ZENRIN タイル）に案件領域のみ表示する（筆ポリゴンは重ねない）
//   - 公図風ビューの筆クリックで、右ペインに土地詳細・訪問記録を全面表示する
// ============================================================

const STATUS_DEFS = window.DataStore.STATUS_DEFS;
const STATUS_KEYS = ['target', 'acquired'];

const $ = (id) => document.getElementById(id);
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}/${pad(dt.getMonth()+1)}/${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};
const fmtDateOnly = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return `${dt.getFullYear()}/${dt.getMonth()+1}/${dt.getDate()}`;
};
const PRINCIPAL_LABELS = { principal: '主権者', non_principal: '非主権者', other: 'その他' };
const principalLabel = (p) => PRINCIPAL_LABELS[p] || PRINCIPAL_LABELS.principal;

function getProjectId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('projectId') || params.get('id');
}

function showError(msg) {
  const host = $('map-host');
  host.innerHTML = `<div class="error-card">${escHtml(msg)} <br><br><a href="index.html">← 案件一覧へ戻る</a></div>`;
}

(async function main() {
  let projects;
  try {
    projects = await window.DataStore.load();
  } catch (e) {
    console.error(e);
    showError(`データの読み込みに失敗しました: ${e.message}`);
    return;
  }
  const projectId = getProjectId();
  const proj = projectId ? projects.find((p) => p.id === projectId) : null;

  if (!proj) {
    $('title').innerHTML = '<a href="index.html" class="sys-name">案件管理システム</a> — 案件詳細 — 案件未指定 <span class="badge">DEMO</span>';
    showError('案件が見つかりません。案件一覧から案件を選んでください。');
    return;
  }

  document.title = `${proj.name} — 案件詳細`;
  $('title').innerHTML = `<a href="index.html" class="sys-name">案件管理システム</a> — ${escHtml(proj.name)} — 案件詳細 <span class="badge">DEMO</span>`;
  // 編集画面（index.html）への導線をセット
  const editLink = $('edit-link');
  if (editLink) {
    editLink.href = `edit.html?projectId=${encodeURIComponent(proj.id)}`;
    editLink.style.display = '';
  }

  setupInfoCard(proj);
  setupMap(proj);
  setupLandViews(proj, projects);
})();

// ---------- 案件サマリー（住所・アクセス・総坪数・容積率・想定容積率） ----------
function setupInfoCard(proj) {
  const card = $('info-card');
  const setRow = (id, value) => {
    const el = $(id);
    if (!el) return;
    if (value == null || value === '') {
      el.textContent = '—';
      el.classList.add('muted');
    } else {
      el.textContent = value;
      el.classList.remove('muted');
    }
  };

  setRow('info-description', proj.description);
  setRow('info-address', proj.address);
  setRow('info-access', proj.access);

  // 総坪数: lands の坪数を集計
  const totalAreaTsubo = (proj.lands || []).reduce((sum, l) => sum + (Number(l.areaTsubo) || 0), 0);
  setRow('info-tsubo', totalAreaTsubo > 0 ? `${totalAreaTsubo} 坪` : null);

  setRow('info-far', proj.currentFar != null ? `${proj.currentFar}%` : null);
  setRow('info-target-far', proj.targetFar != null ? `${proj.targetFar}%` : null);

  card.style.display = '';
}

// ---------- 地図（ZENRIN タイル + 案件領域ポリゴン） ----------
function setupMap(proj) {
  // 地図は通常通りパン/ズーム可能。初期構図は polygon に対する fitBounds で決める。
  const map = L.map('map', {
    center: [35.71, 139.78],
    zoom: 17,
    minZoom: 13,
    maxZoom: 22,
    zoomControl: true,
    attributionControl: false,
  });
  L.tileLayer('/tile/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(map);

  // 地番・表札ラベル（GeoJSON ベース）。
  // 注意: 現在の埋め込みデータ（embedded_data.js）は川口駅周辺のみカバーしているので、
  //       西浅草など別エリアの案件では何も表示されない。
  //       表示するには対象エリアのデータを embedded_data.js に追加する必要がある。
  if (window.ZMAP_DATA) {
    const makeLabelLayer = (geojson, cls) => {
      const group = L.featureGroup();
      if (!geojson || !geojson.features) return group;
      geojson.features.forEach((f) => {
        if (!f.geometry) return;
        const [lng, lat] = f.geometry.coordinates;
        const text = (f.properties && f.properties.text) || '';
        if (!text) return;
        L.marker([lat, lng], {
          icon: L.divIcon({ className: `map-label ${cls}`, html: escHtml(text), iconSize: null }),
          interactive: false,
          keyboard: false,
        }).addTo(group);
      });
      return group;
    };
    makeLabelLayer(window.ZMAP_DATA.chiban, 'label-chiban').addTo(map);
    makeLabelLayer(window.ZMAP_DATA.juukyo, 'label-juukyo').addTo(map);
  }

  if (Array.isArray(proj.polygon) && proj.polygon.length >= 3) {
    const layer = L.polygon(proj.polygon, {
      color: '#065a82', weight: 3, opacity: 0.9,
      dashArray: '6 6', fillColor: '#065a82', fillOpacity: 0.12,
    }).addTo(map);

    // 各辺の長さラベル（辺の中点）
    const pts = proj.polygon;
    for (let i = 0; i < pts.length; i++) {
      const a = L.latLng(pts[i]);
      const b = L.latLng(pts[(i + 1) % pts.length]);
      const len = a.distanceTo(b);
      const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
      L.marker(mid, {
        icon: L.divIcon({
          className: 'edge-length-label',
          html: `${len.toFixed(1)} m`,
          iconSize: null,
        }),
        interactive: false,
        keyboard: false,
      }).addTo(map);
    }

    // 前面道路幅員の両端矢印アロー
    drawRoadWidthArrows(map, pts, proj.frontRoads || []);

    try {
      // ZENRIN タイルの最大ズーム（22）まで使い、ポリゴン領域をできるだけ拡大して表示する。
      map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 22 });
    } catch (_) {}
  }

  return map;
}

// ---------- 公図風ビュー + 詳細カード ----------
function setupLandViews(proj, projects) {
  // ---- 選択状態（公図風 SVG のハイライト） ----
  const svgPolyByLandId = new Map(); // landId → SVG polygon 要素
  let selectedLandId = null;
  const detailCard = $('land-detail-card');

  function closeLandDetail() {
    if (selectedLandId) {
      svgPolyByLandId.get(selectedLandId)?.classList.remove('selected');
      selectedLandId = null;
    }
    detailCard.style.display = 'none';
  }
  function showLandDetail(land) {
    if (selectedLandId && selectedLandId !== land.id) {
      svgPolyByLandId.get(selectedLandId)?.classList.remove('selected');
    }
    selectedLandId = land.id;
    svgPolyByLandId.get(land.id)?.classList.add('selected');

    const def = STATUS_DEFS[land.status] || STATUS_DEFS.target;
    const fullChiban = [land.aza, land.chiban].filter(Boolean).join(' ') || '—';
    $('land-detail-title').textContent = `地番 ${fullChiban}`;

    $('land-detail-meta').innerHTML = `
      <div class="label">ステータス</div>
      <div class="value"><span class="status-pill" style="background:${def.color}">${escHtml(def.label)}</span></div>
      <div class="label">地権者</div>
      <div class="value">${escHtml(window.DataStore.formatOwners(land.owners) || '—')}</div>
      <div class="label">坪数</div>
      <div class="value">${land.areaTsubo} 坪</div>
      <div class="label">概要</div>
      <div class="value">${escHtml(land.description || '—')}</div>
      <div class="label">登録日</div>
      <div class="value">${escHtml(fmtDateOnly(land.createdAt))}</div>
      <div class="label">更新日</div>
      <div class="value">${escHtml(fmtDate(land.updatedAt || land.createdAt))}</div>
    `;

    renderVisits(land);
    renderVisitForm(land);

    detailCard.style.display = '';
  }

  // 訪問記録一覧の描画。追加後の差し替えで同じロジックを使えるよう独立化。
  function renderVisits(land) {
    const visits = Array.isArray(land.visits) ? land.visits : [];
    $('land-visits-heading').textContent = `訪問記録（${visits.length}件）`;
    // 訪問1件分のメタ（直TEL / 面談 / 進捗 / 区分 / 次回）を「アイテム」として並べる
    const item = (k, v) => v ? `<span class="item"><span class="k">${escHtml(k)}</span>${escHtml(v)}</span>` : '';
    $('land-visits').innerHTML = visits.length === 0
      ? '<div class="no-visits">訪問記録はまだありません</div>'
      : visits
          .slice()
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .map((v) => `
            <div class="visit">
              <div class="cuser">${escHtml(v.user)}</div>
              <div class="ctext">${escHtml(v.comment || '')}</div>
              <div class="cdate">${fmtDate(v.date)}</div>
              <div class="cmeta">
                ${item('直TEL', v.directOrTel)}
                ${item('面談', v.meetingType)}
                ${item('進捗', v.progress)}
                ${item('区分', principalLabel(v.principal))}
                ${v.nextDate ? item('次回', fmtDate(v.nextDate)) : ''}
              </div>
            </div>
          `).join('');
  }
  $('land-detail-close').addEventListener('click', closeLandDetail);

  // 訪問追加フォームを描画（毎回 land を束縛し直す）。
  // CLAUDE.md ポリシーで「既存訪問の編集・削除は不可、追加のみ」なので新規追加のみ提供。
  function renderVisitForm(land) {
    const host = $('land-visit-add');
    host.innerHTML = `
      <h5>訪問記録を追加</h5>
      <div class="field">
        <label>コメント <span style="color:#ef4444">*</span></label>
        <textarea id="vf-comment" placeholder="コメントを入力" required></textarea>
      </div>
      <div class="field-2col">
        <div>
          <label>直TEL</label>
          <select id="vf-direct">
            <option value="">—</option>
            <option value="直">直</option>
            <option value="TEL">TEL</option>
          </select>
        </div>
        <div>
          <label>面談区分</label>
          <select id="vf-meeting">
            <option value="">—</option>
            <option value="面談(対面)">面談(対面)</option>
            <option value="面談(ITP)">面談(ITP)</option>
          </select>
        </div>
      </div>
      <div class="field-2col">
        <div>
          <label>進捗</label>
          <select id="vf-progress">
            <option value="">—</option>
            <option value="初期見込み">初期見込み</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="D">D</option>
          </select>
        </div>
        <div>
          <label>主権者区分</label>
          <select id="vf-principal">
            <option value="principal">主権者</option>
            <option value="non_principal">非主権者</option>
            <option value="other">その他</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>次回予定日時</label>
        <input type="datetime-local" id="vf-next-date">
      </div>
      <button type="button" class="submit" id="vf-submit">＋ 訪問記録を追加</button>
    `;
    $('vf-submit').addEventListener('click', () => addVisitFromForm(land));
  }

  async function addVisitFromForm(land) {
    const q = (id) => document.getElementById(id);
    const comment = q('vf-comment').value.trim();
    if (!comment) {
      alert('コメントは必須です');
      return;
    }
    const nextDateRaw = q('vf-next-date').value;
    // サーバへ追加し、成功すればローカルの land.visits にも反映される。
    // 担当者名はフォームから廃止（user は未指定のまま保存される）。
    try {
      await window.DataStore.addVisit(projects, proj.id, land.id, {
        comment,
        directOrTel: q('vf-direct').value || '',
        meetingType: q('vf-meeting').value || '',
        progress: q('vf-progress').value || '',
        nextDate: nextDateRaw ? new Date(nextDateRaw).toISOString() : '',
        principal: q('vf-principal').value || 'principal',
      });
    } catch (e) {
      console.error(e);
      alert(`訪問記録の追加に失敗しました: ${e.message}`);
      return;
    }
    renderVisits(land);
    renderVisitForm(land);
  }

  // ---- 左ペイン: 土地ポリゴンから公図風ビュー（白地・北上の SVG）を生成 ----
  buildKouzuView();

  function buildKouzuView() {
    const stage = $('kouzu-stage');
    if (!stage) return;
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const lands = (proj.lands || []).filter(
      (l) => Array.isArray(l.polygon) && l.polygon.length >= 3
    );
    if (lands.length === 0) {
      stage.innerHTML = '<div class="kouzu-empty">領域が設定された土地がありません</div>';
      return;
    }

    // 緯度経度 → ローカル平面メートル座標（重心緯度での正距円筒近似）。
    // SVG は左上原点・y 下向きなので、北（緯度大）が上になるよう y を反転する。
    const allPts = lands.flatMap((l) => l.polygon);
    const lat0 = allPts.reduce((s, p) => s + p[0], 0) / allPts.length;
    const lng0 = allPts.reduce((s, p) => s + p[1], 0) / allPts.length;
    const M_PER_LAT = 111320;
    const mPerLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const toXY = ([lat, lng]) => [(lng - lng0) * mPerLng, -(lat - lat0) * M_PER_LAT];

    const xys = allPts.map(toXY);
    const minX = Math.min(...xys.map((p) => p[0]));
    const maxX = Math.max(...xys.map((p) => p[0]));
    const minY = Math.min(...xys.map((p) => p[1]));
    const maxY = Math.max(...xys.map((p) => p[1]));
    const extent = Math.max(maxX - minX, maxY - minY);
    const pad = extent * 0.08;
    const viewW = (maxX - minX) + pad * 2;
    const viewH = (maxY - minY) + pad * 2;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${viewW.toFixed(2)} ${viewH.toFixed(2)}`);
    // ペインの実寸いっぱいに収める（縦横比は viewBox が保持）
    const stageRect = stage.getBoundingClientRect();
    const fit = Math.min(
      Math.max(120, stageRect.width - 32) / viewW,
      Math.max(120, stageRect.height - 32) / viewH
    );
    svg.setAttribute('width', (viewW * fit).toFixed(0));
    svg.setAttribute('height', (viewH * fit).toFixed(0));

    const tx = ([x, y]) => [x - minX + pad, y - minY + pad];

    // ラベル文字サイズは平均筆サイズ基準（筆からはみ出しすぎない程度）。単位はメートル。
    const avgAreaM2 = lands.reduce(
      (s, l) => s + window.DataStore.polygonAreaTsubo(l.polygon) * 3.305785, 0
    ) / lands.length;
    const fontSize = Math.min(extent / 30, Math.sqrt(avgAreaM2) * 0.16);

    lands.forEach((land) => {
      const def = STATUS_DEFS[land.status] || STATUS_DEFS.target;
      const pts = land.polygon.map(toXY).map(tx);
      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('class', 'fude');
      polygon.setAttribute('points', pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' '));
      polygon.setAttribute('fill', def.color);
      polygon.setAttribute('fill-opacity', '0.40');
      polygon.setAttribute('stroke', def.color);
      const title = document.createElementNS(SVG_NS, 'title');
      title.textContent = `${land.chiban || '—'} / ${def.label} / ${land.areaTsubo}坪`;
      polygon.appendChild(title);
      polygon.addEventListener('click', (e) => {
        e.stopPropagation();
        showLandDetail(land);
      });
      svgPolyByLandId.set(land.id, polygon);
      svg.appendChild(polygon);

      // 筆の重心に「地番 / 地権者（持分） / 坪数」を行で重ねる
      let cx = 0, cy = 0;
      pts.forEach(([x, y]) => { cx += x; cy += y; });
      cx /= pts.length;
      cy /= pts.length;

      const ownerLines = (land.owners || [])
        .map((o) => (o && o.name ? (o.share ? `${o.name}（${o.share}）` : o.name) : ''))
        .filter(Boolean);
      const lines = [land.chiban || '—'].concat(ownerLines, [`${land.areaTsubo}坪`]);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'fude-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('x', cx.toFixed(2));
      text.setAttribute('y', cy.toFixed(2));
      text.setAttribute('font-size', fontSize.toFixed(2));
      text.setAttribute('stroke-width', (fontSize * 0.22).toFixed(2));

      const lineHeightEm = 1.2;
      const startDy = -((lines.length - 1) / 2) * lineHeightEm;
      lines.forEach((line, i) => {
        const t = document.createElementNS(SVG_NS, 'tspan');
        t.setAttribute('x', cx.toFixed(2));
        t.setAttribute('dy', i === 0 ? `${startDy.toFixed(2)}em` : `${lineHeightEm}em`);
        t.textContent = line;
        text.appendChild(t);
      });
      svg.appendChild(text);
    });

    // 方位記号（北上固定なので右上に N↑）
    const north = document.createElementNS(SVG_NS, 'text');
    north.setAttribute('class', 'north-mark');
    north.setAttribute('text-anchor', 'end');
    north.setAttribute('x', (viewW - pad * 0.4).toFixed(2));
    north.setAttribute('y', (pad * 0.8).toFixed(2));
    north.setAttribute('font-size', (fontSize * 1.2).toFixed(2));
    north.textContent = 'N ↑';
    svg.appendChild(north);

    stage.replaceChildren(svg);
  }
}

// ---------- 前面道路幅員：両端矢印アロー ----------
// 案件領域ポリゴンの各辺について、frontRoads に幅員が指定されていれば
// その辺の中点から外向き垂直方向に「幅員ぶん」伸びる両端矢印を描く。
// 測量図風の表現：直線 + 両端の三角矢頭（apex 外向き） + 中央に数値ラベル。
function drawRoadWidthArrows(map, polygonPoints, frontRoads) {
  if (!Array.isArray(frontRoads) || frontRoads.length === 0) return;
  if (!Array.isArray(polygonPoints) || polygonPoints.length < 3) return;

  // 地球を球と仮定した簡易な「メートル ↔ 緯度経度」変換ヘルパー
  // 小スケール（案件数十m）の幾何計算では十分な精度。
  const METER_PER_LAT = 111000;
  const meterPerLng = (lat) => 111000 * Math.cos(lat * Math.PI / 180);
  const offsetLL = (latlng, dE_m, dN_m) =>
    L.latLng(
      latlng.lat + dN_m / METER_PER_LAT,
      latlng.lng + dE_m / meterPerLng(latlng.lat),
    );

  // 外向き判定用にポリゴン重心を計算
  let cLat = 0, cLng = 0;
  polygonPoints.forEach(([la, ln]) => { cLat += la; cLng += ln; });
  const centroid = L.latLng(cLat / polygonPoints.length, cLng / polygonPoints.length);

  const ARROW_COLOR = '#b91c1c';

  // 矢頭の三角形を生成（apex は dir 方向、size メートル）
  const makeArrowhead = (apex, dirE, dirN, size, perpE, perpN) => {
    // base center = apex - dir*size、底辺の幅 = size
    const baseCenter = offsetLL(apex, -dirE * size, -dirN * size);
    const v1 = offsetLL(baseCenter, perpE * size * 0.5, perpN * size * 0.5);
    const v2 = offsetLL(baseCenter, -perpE * size * 0.5, -perpN * size * 0.5);
    return [apex, v1, v2];
  };

  frontRoads.forEach((entry) => {
    const i = entry.edgeIndex;
    const w = Number(entry.width);
    if (!isFinite(w) || w <= 0) return;
    if (i < 0 || i >= polygonPoints.length) return;

    const a = L.latLng(polygonPoints[i]);
    const b = L.latLng(polygonPoints[(i + 1) % polygonPoints.length]);
    const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
    const latAvg = mid.lat;

    // 辺方向（east, north 成分のメートル）
    const dE = (b.lng - a.lng) * meterPerLng(latAvg);
    const dN = (b.lat - a.lat) * METER_PER_LAT;
    const edgeLen = Math.sqrt(dE * dE + dN * dN);
    if (edgeLen === 0) return;
    const edgeE = dE / edgeLen;
    const edgeN = dN / edgeLen;

    // 垂直方向の候補（左右）
    const p1E = -edgeN, p1N = edgeE;
    const p2E = edgeN,  p2N = -edgeE;

    // mid - centroid を外向き参考ベクトルにして、より外を向くほうを採用
    const outRefE = (mid.lng - centroid.lng) * meterPerLng(latAvg);
    const outRefN = (mid.lat - centroid.lat) * METER_PER_LAT;
    const useP1 = (p1E * outRefE + p1N * outRefN) > (p2E * outRefE + p2N * outRefN);
    const perpE = useP1 ? p1E : p2E;
    const perpN = useP1 ? p1N : p2N;

    // 矢印の始点（辺の中点）と終点（外向きに幅員ぶん移動）
    const start = mid;
    const end = offsetLL(start, perpE * w, perpN * w);

    // 矢印本体
    L.polyline([start, end], {
      color: ARROW_COLOR,
      weight: 2,
      opacity: 0.95,
      interactive: false,
    }).addTo(map);

    // 矢頭サイズは幅員の 18% で頭打ち（細道で大きすぎ・大通りで小さすぎを抑制）
    const arrowSize = Math.min(Math.max(w * 0.18, 0.6), 1.4);

    // 始点側の三角（apex 内向き＝-perp）
    L.polygon(makeArrowhead(start, -perpE, -perpN, arrowSize, edgeE, edgeN), {
      color: ARROW_COLOR, fillColor: ARROW_COLOR,
      weight: 0, fillOpacity: 1, opacity: 1,
      interactive: false,
    }).addTo(map);

    // 終点側の三角（apex 外向き＝+perp）
    L.polygon(makeArrowhead(end, perpE, perpN, arrowSize, edgeE, edgeN), {
      color: ARROW_COLOR, fillColor: ARROW_COLOR,
      weight: 0, fillOpacity: 1, opacity: 1,
      interactive: false,
    }).addTo(map);

    // ラベル（矢印中点を辺方向に少しずらして、線と重ならないように）
    const labelOffsetTangent = arrowSize * 1.4;
    const labelPos = offsetLL(
      start,
      perpE * (w / 2) + edgeE * labelOffsetTangent,
      perpN * (w / 2) + edgeN * labelOffsetTangent,
    );
    L.marker(labelPos, {
      icon: L.divIcon({
        className: 'road-width-label',
        html: `${w.toFixed(1)} m`,
        iconSize: null,
      }),
      interactive: false,
      keyboard: false,
    }).addTo(map);
  });
}

// 「サンプルデータに戻す」ボタンのリスナー（4 画面共通仕様。common.js を読まないので個別実装）。
document.getElementById('btn-reset')?.addEventListener('click', async () => {
  if (!confirm('データベースの内容を破棄し、サンプルデータに戻します。よろしいですか？')) return;
  try {
    await window.DataStore.reset();
  } catch (e) {
    console.error(e);
    alert(`リセットに失敗しました: ${e.message}`);
    return;
  }
  window.location.reload();
});
