// ============================================================
// 案件一覧画面（index.html 専用）
//   - 全案件を地図 + サイドリストで俯瞰
//   - カード or ポリゴンクリックで案件詳細（detail.html）へ遷移
//   - 「＋ 新規案件」モーダルで案件を作成 → そのまま案件編集（edit.html）へ
//   - 住所検索（Nominatim ジオコーディング）で地図を移動
// common.js を先に読み込んでおく必要がある（state / ヘルパー / モーダル基盤を共有）。
// ============================================================

let listMap = null;

// ---------- 案件一覧（地図 + サイドリスト） ----------
function renderProjectsList() {
  const items = state.projects.length === 0
    ? `<div class="list-side-empty">案件がありません。<br>「＋ 新規案件」から作成してください。</div>`
    : state.projects.map(p => {
        const c = countLandStatuses(p);
        const total = p.lands.length;
        const pct = total > 0 ? Math.round((c.acquired / total) * 100) : 0;
        const meta = total > 0
          ? `取得済 ${c.acquired} / ${total} 件（${pct}%）`
          : '土地なし';
        return `
          <div class="list-card" data-id="${p.id}">
            <div class="lc-name">${escHtml(p.name)}</div>
            ${p.description ? `<div class="lc-desc">${escHtml(p.description)}</div>` : ''}
            <div class="lc-meta">
              <span>${p.lands.length} 件</span>
              <span class="dot">·</span>
              <span>${totalAreaTsubo(p)} 坪</span>
              <span class="dot">·</span>
              <span>更新 ${fmtDateOnly(p.updatedAt || p.createdAt)}</span>
            </div>
            ${renderStatusBar(p, { compact: true })}
            <div class="lc-progress-meta">${meta}</div>
          </div>
        `;
      }).join('');

  return `
    <div class="list-layout">
      <div class="list-map-area">
        <form class="list-map-search" id="list-search-form" autocomplete="off">
          <input type="search" id="list-search" placeholder="住所で地図を移動">
        </form>
        <div id="list-map"></div>
      </div>
      <aside class="list-side">
        <div class="list-side-header">
          <div>
            <h2>案件一覧</h2>
            <div class="count">${state.projects.length} 件</div>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-new-project">＋ 新規案件</button>
        </div>
        <div class="list-side-items" id="list-side-items">${items}</div>
      </aside>
    </div>
  `;
}

function bindProjectsList() {
  $('btn-new-project').addEventListener('click', () => openProjectCreateForm());

  // 地図初期化（ZENRIN タイル）
  const map = L.map('list-map', {
    center: [35.71, 139.78],
    zoom: 16,
    minZoom: 13,
    maxZoom: 22,
    zoomControl: true,
    attributionControl: false,
  });
  L.tileLayer('/tile/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(map);
  listMap = map;

  // 案件ごとに polygon を地図に追加
  const POLY_STYLE = {
    color: '#065a82', weight: 3, opacity: 0.9,
    dashArray: '6 6', fillColor: '#065a82', fillOpacity: 0.12,
  };

  const allBounds = [];

  function goToDetail(projectId) {
    window.location.href = `detail.html?projectId=${encodeURIComponent(projectId)}`;
  }

  state.projects.forEach((p) => {
    if (!Array.isArray(p.polygon) || p.polygon.length < 3) return;
    const layer = L.polygon(p.polygon, POLY_STYLE).addTo(map);
    layer.bindTooltip(escHtml(p.name), {
      permanent: true, direction: 'center',
      className: 'list-map-label',
    });
    layer.on('click', () => goToDetail(p.id));
    allBounds.push(layer.getBounds());
  });

  // 初期ビュー: 全案件をフィット。ポリゴンが 1 件もないなら default のまま。
  if (allBounds.length > 0) {
    const merged = allBounds.reduce((acc, b) => acc.extend(b), L.latLngBounds(allBounds[0].getSouthWest(), allBounds[0].getNorthEast()));
    try { map.fitBounds(merged, { padding: [32, 32], maxZoom: 18 }); } catch (_) {}
  }

  // リストカード本体クリック → 案件詳細（detail.html）へ遷移。
  document.querySelectorAll('.list-card').forEach((card) => {
    card.addEventListener('click', () => goToDetail(card.dataset.id));
  });

  // ----- 住所検索 → 地図移動 -----
  // OpenStreetMap Nominatim でジオコーディング → 該当地点へ地図を移動する。
  // Nominatim は 1 req/sec のレート制限があるためインクリメンタル検索ではなく Enter 確定式。
  const searchForm = document.getElementById('list-search-form');
  const searchInput = document.getElementById('list-search');

  async function geocodeAndFly(query) {
    const q = query.trim();
    if (!q) return;
    searchInput.disabled = true;
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ja&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      if (!Array.isArray(arr) || arr.length === 0) {
        toast('該当する住所が見つかりませんでした');
        return;
      }
      const { lat, lon } = arr[0];
      const target = [parseFloat(lat), parseFloat(lon)];
      if (!Number.isFinite(target[0]) || !Number.isFinite(target[1])) {
        toast('住所の座標を取得できませんでした');
        return;
      }
      try { map.flyTo(target, 18, { duration: 0.8 }); } catch (_) { map.setView(target, 18); }
    } catch (e) {
      console.error(e);
      toast('住所検索に失敗しました');
    } finally {
      searchInput.disabled = false;
    }
  }

  if (searchForm) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      geocodeAndFly(searchInput.value);
    });
  }
}

// ---------- 案件新規作成フォーム ----------
// 編集は案件編集画面のインライン編集に移行したため、モーダルは新規作成専用となった。
// 案件名と概要だけのシンプルなフォームで、作成後は案件編集画面（edit.html）へ遷移して
// そこで公図PDFや領域ポリゴンを設定する流れ。
function openProjectCreateForm() {
  const body = `
    <div id="form-error" class="form-error" style="display:none"></div>
    <div class="form-row">
      <label>案件名 <span style="color:#ef4444">*</span></label>
      <input type="text" id="f-name" placeholder="例：川口駅東口案件">
    </div>
    <div class="form-row">
      <label>概要</label>
      <textarea id="f-description" placeholder="案件の概要・狙いなど"></textarea>
      <div class="hint">作成後、案件編集画面で領域ポリゴンや土地を設定できます。</div>
    </div>
  `;

  const saveBtn = makeBtn('作成', 'btn-primary', async () => {
    const errEl = document.getElementById('form-error');
    errEl.style.display = 'none';

    const name = document.getElementById('f-name').value.trim();
    const description = document.getElementById('f-description').value.trim();

    if (!name) {
      errEl.textContent = '案件名は必須です';
      errEl.style.display = 'block';
      return;
    }

    let created;
    try {
      created = await window.DataStore.createProject(state.projects, { name, description, polygon: null });
    } catch (e) {
      console.error(e);
      errEl.textContent = `作成に失敗しました: ${e.message}`;
      errEl.style.display = 'block';
      return;
    }
    toast('案件を作成しました');
    closeModal();
    window.location.href = `edit.html?projectId=${encodeURIComponent(created.id)}`;
  });

  openModal({
    title: '新規案件',
    body,
    footer: [makeBtn('キャンセル', '', closeModal), saveBtn],
    wide: false,
  });

  setTimeout(() => {
    document.getElementById('f-name')?.focus();
  }, 50);
}

// ---------- 起動 ----------
(async function bootstrap() {
  const main = $('main');
  main.classList.add('list-mode');
  try {
    await initAppState();
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card" style="margin:24px">データの読み込みに失敗しました: ${escHtml(e.message)}</div>`;
    return;
  }
  main.innerHTML = renderProjectsList();
  bindProjectsList();
})();
