// ============================================================
// 案件編集画面（edit.html 専用）
//   - 案件・土地のインライン CRUD（鉛筆 → ✓/✕）
//   - 領域マップ（Leaflet.draw でポリゴン描画）
//   - 公図風ビュー（土地ポリゴンの SVG 表示・クリック選択）+ 右側土地パネル
//   - 土地の領域は登記所備付地図の実筆を「図面 + 地番」のプルダウンで選択する
// 必須クエリ: ?projectId=xxx
// common.js を先に読み込んでおく必要がある。
// ============================================================

// 案件編集画面で表示中の Leaflet マップ（領域マップ）と公図風ビュー。
// renderEdit() 再描画前に必ず破棄する。
let detailMap = null;
let kouzuView = null;

// URL クエリから対象案件 ID を取得（state.projects と突き合わせ）。
const currentProjectId = new URLSearchParams(window.location.search).get('projectId');

// ---------- メインレンダリング ----------
function renderEdit() {
  if (detailMap) { try { detailMap.remove(); } catch (_) {} detailMap = null; }
  if (kouzuView) { try { kouzuView.destroy(); } catch (_) {} kouzuView = null; }
  const main = $('main');
  const proj = state.projects.find(p => p.id === currentProjectId);
  if (!proj) {
    main.innerHTML = `<div class="card">案件が見つかりません。<a href="index.html">案件一覧へ戻る</a></div>`;
    return;
  }
  main.innerHTML = renderProjectDetail(proj);
  bindProjectDetail(proj);
}

// ---------- 案件編集ビューの本体 ----------
function renderProjectDetail(proj) {
  const c = countLandStatuses(proj);

  return `
    <div class="page-header">
      <div>
        <div class="crumbs">
          <a href="index.html">案件一覧</a> &nbsp;›&nbsp;
          <a href="detail.html?projectId=${proj.id}">案件詳細</a> &nbsp;›&nbsp;
          <span>案件編集</span> &nbsp;›&nbsp;
          <span id="crumb-name">${escHtml(proj.name)}</span>
        </div>
        <h2 id="proj-title">${escHtml(proj.name)}</h2>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>案件情報</h3>
        <span class="save-status" id="save-status"></span>
      </div>
      <div class="form-grid proj-info-grid">
        <label>案件名 <span class="required">*</span></label>
        <div class="value field-cell" id="field-name"></div>

        <label>概要</label>
        <div class="value field-cell" id="field-description"></div>

        <label>所在地</label>
        <div class="value field-cell" id="field-address"></div>

        <label>アクセス</label>
        <div class="value field-cell" id="field-access"></div>

        <label>現況容積率</label>
        <div class="value field-cell" id="field-current-far"></div>

        <label>想定容積率</label>
        <div class="value field-cell" id="field-target-far"></div>

        <label>登録日</label>
        <div class="value">${fmtDate(proj.createdAt)}</div>

        <label>更新日</label>
        <div class="value" id="proj-updated">${fmtDate(proj.updatedAt || proj.createdAt)}</div>

        <label>土地数</label>
        <div class="value">${proj.lands.length} 件 / 合計 ${totalAreaTsubo(proj)} 坪</div>
      </div>
      <div class="inline-error" id="form-error" style="display:none"></div>
    </div>

    <div class="card">
      <h3>取得状況</h3>
      <div class="progress-info">
        <span>取得済 <strong>${c.acquired}</strong> / ${proj.lands.length} 件</span>
        <span class="pct ${proj.lands.length === 0 || c.acquired === 0 ? 'zero' : ''}">${proj.lands.length === 0 ? 0 : Math.round((c.acquired / proj.lands.length) * 100)}%</span>
      </div>
      ${renderStatusBar(proj)}
    </div>

    <div class="card">
      <div class="card-header">
        <h3>領域マップ</h3>
        <div class="poly-toolbar">
          <span class="save-status" id="poly-status">未設定</span>
          <button class="btn btn-sm" id="poly-draw">＋ ポリゴンを描く</button>
          <button class="btn btn-sm btn-danger" id="poly-clear" style="display:none">クリア</button>
        </div>
      </div>
      <div id="detail-map" class="detail-map"></div>
    </div>

    <div class="card">
      <div class="card-header land-card-header">
        <h3>土地</h3>
        <div class="land-card-tools">
          <div class="land-panel-external-actions" id="detail-land-panel-actions"></div>
          <button class="btn btn-primary btn-sm" id="btn-new-land">＋ 土地を追加</button>
        </div>
      </div>
      <div class="land-split">
        <div id="detail-kouzu" class="kouzu-host"></div>
        <div id="detail-land-panel" class="land-panel"></div>
      </div>
    </div>

    <div class="detail-danger-zone">
      <button class="btn btn-danger" id="btn-delete-project">案件を削除</button>
    </div>
  `;
}

function bindProjectDetail(proj) {
  $('btn-delete-project').addEventListener('click', () => deleteProjectConfirm(proj.id));
  $('btn-new-land').addEventListener('click', () => openLandCreateForm(proj.id));

  // ---------- インライン編集（案件情報・領域マップ） ----------
  const errEl = $('form-error');
  const statusEl = $('save-status');

  function showFormError(msg) {
    errEl.textContent = msg;
    errEl.style.display = '';
  }
  function hideFormError() {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  function setSaveStatus(text, mode = '') {
    statusEl.textContent = text;
    statusEl.className = 'save-status' + (mode ? ' ' + mode : '');
  }
  function hhmm(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // 部分更新で保存。鉛筆編集の確定・ポリゴン変更すべてここを通る。
  // renderEdit() を呼ぶと Leaflet マップが再ロードされてしまうため、
  // タイトル・更新日・パンくずだけを軽量に書き換える（一覧側は次回遷移時に反映）。
  async function saveProjectFields(fields) {
    setSaveStatus('保存中…', 'is-saving');
    try {
      await window.DataStore.updateProject(state.projects, proj.id, fields);
    } catch (e) {
      console.error(e);
      setSaveStatus('保存に失敗しました', 'is-empty');
      showFormError(`保存に失敗しました: ${e.message}`);
      return false;
    }
    $('proj-title').textContent = proj.name;
    $('crumb-name').textContent = proj.name;
    $('proj-updated').textContent = fmtDate(proj.updatedAt || proj.createdAt);
    setSaveStatus(`保存しました · ${hhmm(new Date())}`, 'is-saved');
    return true;
  }

  setupInlineTextField({
    wrapperId: 'field-name',
    type: 'input',
    placeholder: '例：川口駅東口案件',
    getValue: () => proj.name,
    onConfirm: async (next) => {
      const trimmed = next.trim();
      if (!trimmed) {
        showFormError('案件名は必須です');
        return false;
      }
      hideFormError();
      return saveProjectFields({ name: trimmed });
    },
  });
  setupInlineTextField({
    wrapperId: 'field-description',
    type: 'textarea',
    placeholder: '案件の概要・狙いなど',
    getValue: () => proj.description || '',
    onConfirm: (next) => saveProjectFields({ description: next.trim() }),
  });
  setupInlineTextField({
    wrapperId: 'field-address',
    type: 'input',
    placeholder: '例：東京都台東区西浅草2-4-8',
    getValue: () => proj.address || '',
    onConfirm: (next) => saveProjectFields({ address: next.trim() }),
  });
  setupInlineTextField({
    wrapperId: 'field-access',
    type: 'textarea',
    placeholder: '例：東京メトロ銀座線「田原町」駅 徒歩5分',
    getValue: () => proj.access || '',
    onConfirm: (next) => saveProjectFields({ access: next.trim() }),
  });
  setupInlineTextField({
    wrapperId: 'field-current-far',
    type: 'number',
    placeholder: '例：500',
    getValue: () => proj.currentFar,
    formatDisplay: (v) => `${v}%`,
    onConfirm: async (next) => {
      const trimmed = next.trim();
      if (trimmed === '') return saveProjectFields({ currentFar: null });
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num < 0) { showFormError('容積率は 0 以上の数値で入力してください'); return false; }
      hideFormError();
      return saveProjectFields({ currentFar: num });
    },
  });
  setupInlineTextField({
    wrapperId: 'field-target-far',
    type: 'number',
    placeholder: '例：480',
    getValue: () => proj.targetFar,
    formatDisplay: (v) => `${v}%`,
    onConfirm: async (next) => {
      const trimmed = next.trim();
      if (trimmed === '') return saveProjectFields({ targetFar: null });
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num < 0) { showFormError('容積率は 0 以上の数値で入力してください'); return false; }
      hideFormError();
      return saveProjectFields({ targetFar: num });
    },
  });

  const polyMap = setupPolygonMap('detail-map', proj.polygon, {
    onChange: (polygon) => {
      // 前面道路幅員の入力 UI は廃止したが、ポリゴンの頂点数が変わると
      // 既存の辺インデックスが無効になるため frontRoads はクリアする。
      const oldCount = Array.isArray(proj.polygon) ? proj.polygon.length : 0;
      const newCount = Array.isArray(polygon) ? polygon.length : 0;
      if (newCount !== oldCount) {
        saveProjectFields({ polygon, frontRoads: [] });
      } else {
        saveProjectFields({ polygon });
      }
    },
  });
  detailMap = polyMap;

  setSaveStatus('');

  // ---------- 公図風ビュー + 土地パネル の保存ハブ ----------
  async function saveLandFields(landId, fields) {
    try {
      await window.DataStore.updateLand(state.projects, proj.id, landId, fields);
    } catch (e) {
      console.error(e);
      toast(`保存に失敗しました: ${e.message}`);
      return false;
    }
    if ('status' in fields || 'areaTsubo' in fields || 'parcelId' in fields) {
      kouzuView?.refresh?.();
    }
    panel.refreshHeader?.(landId);
    // 筆の付け替えは町名・地番・領域・坪数の表示すべてに影響するためパネルを再描画する
    if ('parcelId' in fields) panel.refreshCurrent?.();
    refreshAcquireProgress();
    return true;
  }

  function refreshAcquireProgress() {
    const c = countLandStatuses(proj);
    const wrap = document.querySelector('.card .progress-info');
    if (wrap) {
      wrap.innerHTML = `
        <span>取得済 <strong>${c.acquired}</strong> / ${proj.lands.length} 件</span>
        <span class="pct ${proj.lands.length === 0 || c.acquired === 0 ? 'zero' : ''}">${proj.lands.length === 0 ? 0 : Math.round((c.acquired / proj.lands.length) * 100)}%</span>`;
    }
    const bar = document.querySelector('.status-bar');
    if (bar) bar.outerHTML = renderStatusBar(proj);
  }

  const panel = setupLandDetailPanel('detail-land-panel', proj, {
    onSaveFields: (landId, fields) => saveLandFields(landId, fields),
    onLandUpdated: () => {
      // 訪問追加など、土地のサブコレクション変更時のフック（取得状況の集計に影響）
      refreshAcquireProgress();
    },
    onDeleteLand: (landId) => deleteLandConfirm(proj.id, landId),
  });

  kouzuView = setupKouzuView('detail-kouzu', proj, {
    onSelect: (landId) => {
      panel.selectLand(landId);
    },
  });
}

// ---------- 土地詳細パネル ----------
function setupLandDetailPanel(panelId, proj, {
  onSaveFields, onLandUpdated, onDeleteLand,
} = {}) {
  const host = document.getElementById(panelId);
  if (!host) return {
    selectLand: () => {}, clear: () => {}, currentId: () => null,
    refreshHeader: () => {}, refreshCurrent: () => {}, isEditingPolygon: () => false,
  };

  let currentLandId = null;
  let isEditingPolygon = false;  // 筆の付け替えプルダウンを表示中か

  const externalActions = document.getElementById(`${panelId}-actions`)
    || document.getElementById('detail-land-panel-actions');

  function renderEmpty() {
    currentLandId = null;
    host.innerHTML = `
      <div class="land-panel-empty">公図ビュー上の筆をクリックして土地を選択してください</div>
    `;
    if (externalActions) externalActions.innerHTML = '';
  }

  function renderLand(landId) {
    const land = proj.lands.find(l => l.id === landId);
    if (!land) { renderEmpty(); return; }
    currentLandId = landId;
    const def = STATUS_DEFS[land.status] || STATUS_DEFS.target;
    const visits = (land.visits || [])
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    host.innerHTML = `
      <div class="land-panel-header">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <strong style="font-size:13px" id="lp-chiban-title">${escHtml(landTitle(land))}</strong>
          <select class="pill pill-select ${def.cls}" id="lp-status-select" title="ステータスを変更">
            ${STATUS_KEYS.map(k => `<option value="${k}"${k === land.status ? ' selected' : ''}>${STATUS_DEFS[k].label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="land-panel-body">
        <div class="form-grid">
          <label>筆（地番）</label>
          <div class="value">
            <div class="poly-inline-toolbar" id="lp-parcel-toolbar"></div>
          </div>

          <label>地権者</label>
          <div class="value field-cell" id="lp-field-owner"></div>

          <label>坪数</label>
          <div class="value field-cell" id="lp-field-areaTsubo"></div>

          <label>概要</label>
          <div class="value field-cell" id="lp-field-description"></div>

          <label>登録日</label>
          <div class="value">${fmtDateOnly(land.createdAt)}</div>

          <label>更新日</label>
          <div class="value" id="lp-updated">${fmtDate(land.updatedAt || land.createdAt)}</div>
        </div>
        <div class="inline-error" id="lp-error" style="display:none"></div>
        <h4 style="margin-top:14px;margin-bottom:6px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:.04em">訪問記録 (${visits.length})</h4>
        <div class="land-panel-visits">
          ${visits.length === 0
            ? '<div style="color:#94a3b8;font-size:12px;padding:6px 0">まだ訪問記録がありません</div>'
            : visits.map(v => `
                <div class="visit">
                  <div class="cuser">${escHtml(v.user)}</div>
                  <div class="ctext">${escHtml(v.comment)}</div>
                  <div class="cdate">${fmtDate(v.date)}</div>
                </div>`).join('')}
        </div>
      </div>
    `;
    if (externalActions) {
      externalActions.innerHTML = `<button class="btn btn-sm btn-danger" data-act="delete">この土地を削除</button>`;
    }
    bindPanelEvents(land);
  }

  function showError(msg) {
    const el = host.querySelector('#lp-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
  }
  function hideError() {
    const el = host.querySelector('#lp-error');
    if (!el) return;
    el.style.display = 'none';
  }

  // パネルヘッダーの表示名: 「町名・丁目 地番」（町名未設定なら地番のみ）
  function landTitle(land) {
    return [land.aza, land.chiban].filter(Boolean).join(' ') || '—';
  }

  function refreshHeader(landId) {
    if (landId !== currentLandId) return;
    const land = proj.lands.find(l => l.id === landId);
    if (!land) return;
    const def = STATUS_DEFS[land.status] || STATUS_DEFS.target;
    const titleEl = host.querySelector('#lp-chiban-title');
    if (titleEl) titleEl.textContent = landTitle(land);
    const selectEl = host.querySelector('#lp-status-select');
    if (selectEl) {
      selectEl.className = `pill pill-select ${def.cls}`;
      selectEl.value = land.status;
    }
    const updatedEl = host.querySelector('#lp-updated');
    if (updatedEl) updatedEl.textContent = fmtDate(land.updatedAt || land.createdAt);
    renderParcelRow();
    refreshDeleteButton();
  }

  // 筆行: 通常時は紐付く筆の表示 + 「筆を変更」。編集時は 町名 → 地番 のプルダウンで
  // 筆マスタから選び直す（マスタに存在する筆しか選べないため、不正な状態は作れない）。
  // 町名・筆の選択肢は町名単位で遅延取得するため async（取得中はプルダウンを無効化して示す）。
  async function renderParcelRow() {
    const toolbar = host.querySelector('#lp-parcel-toolbar');
    if (!toolbar) return;
    const land = proj.lands.find(l => l.id === currentLandId);
    if (!land) return;

    if (!isEditingPolygon) {
      toolbar.innerHTML = `
        <span class="save-status is-set">${escHtml(landTitle(land))}</span>
        <button type="button" class="btn btn-sm" data-parcel-act="change">筆を変更</button>
      `;
      bindParcelRowEvents();
      return;
    }

    toolbar.innerHTML = `
      <select id="lp-parcel-area" title="町名・丁目" disabled><option>読み込み中…</option></select>
      <select id="lp-parcel-chiban" title="地番" disabled></select>
      <button type="button" class="field-icon-btn confirm" data-parcel-act="confirm" title="確定" disabled>✓</button>
      <button type="button" class="field-icon-btn cancel" data-parcel-act="cancel" title="取消">✕</button>
    `;
    bindParcelRowEvents();

    let towns;
    try {
      towns = await window.DataStore.parcelTowns();
    } catch (e) {
      console.error(e);
      toast(`町名一覧の取得に失敗しました: ${e.message}`);
      isEditingPolygon = false;
      renderParcelRow();
      refreshDeleteButton();
      return;
    }
    const areaSel = toolbar.querySelector('#lp-parcel-area');
    if (!areaSel || !areaSel.isConnected) return; // 取得中にパネルが再描画された
    areaSel.innerHTML = towns
      .map(t => `<option value="${escHtml(t.name)}">${escHtml(t.name)}</option>`)
      .join('');
    areaSel.disabled = false;
    // 初期選択: 現在紐付いている筆の町名・地番
    if (towns.some(t => t.name === land.aza)) areaSel.value = land.aza;
    populateParcelSelect(land.parcelId);
  }

  // 町名プルダウンの選択に応じて地番プルダウンを作り直す（筆一覧は町名単位で遅延取得）。
  // 同じ案件にすでに紐付いている筆は除外する（1案件内での筆の重複を防ぐ）。
  let parcelSelectToken = 0; // 町名を連続で切り替えたとき、古い応答で上書きしないためのトークン
  async function populateParcelSelect(preferParcelId) {
    const toolbar = host.querySelector('#lp-parcel-toolbar');
    const areaSel = toolbar?.querySelector('#lp-parcel-area');
    const parcelSel = toolbar?.querySelector('#lp-parcel-chiban');
    const confirmBtn = toolbar?.querySelector('[data-parcel-act="confirm"]');
    if (!areaSel || !parcelSel) return;
    const token = ++parcelSelectToken;
    parcelSel.disabled = true;
    parcelSel.innerHTML = '<option value="">読み込み中…</option>';
    if (confirmBtn) confirmBtn.disabled = true;

    let parcels;
    try {
      parcels = await window.DataStore.parcelsByTown(areaSel.value);
    } catch (e) {
      console.error(e);
      if (token === parcelSelectToken && parcelSel.isConnected) {
        parcelSel.innerHTML = '<option value="">（筆一覧の取得に失敗）</option>';
      }
      return;
    }
    if (token !== parcelSelectToken || !parcelSel.isConnected) return;

    const usedIds = new Set(
      proj.lands.filter(l => l.id !== currentLandId).map(l => l.parcelId)
    );
    const avail = parcels.filter(p => !usedIds.has(p.parcelId));
    parcelSel.innerHTML = avail.length
      ? avail.map(p => `<option value="${escHtml(p.parcelId)}">${escHtml(p.chiban)}</option>`).join('')
      : '<option value="">（この町名の筆はすべて追加済み）</option>';
    if (preferParcelId && avail.some(p => p.parcelId === preferParcelId)) {
      parcelSel.value = preferParcelId;
    }
    parcelSel.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
  }

  function bindParcelRowEvents() {
    const toolbar = host.querySelector('#lp-parcel-toolbar');
    if (!toolbar) return;
    toolbar.querySelector('[data-parcel-act="change"]')?.addEventListener('click', () => {
      if (currentLandId == null) return;
      isEditingPolygon = true;
      refreshDeleteButton();
      renderParcelRow();
    });
    toolbar.querySelector('#lp-parcel-area')?.addEventListener('change', () => populateParcelSelect());
    toolbar.querySelector('[data-parcel-act="confirm"]')?.addEventListener('click', () => {
      const parcelId = toolbar.querySelector('#lp-parcel-chiban')?.value;
      if (!parcelId) return;
      isEditingPolygon = false;
      // updateLand が筆マスタから町名・地番・領域・坪数を再導出する
      saveField(currentLandId, { parcelId });
      refreshDeleteButton();
    });
    toolbar.querySelector('[data-parcel-act="cancel"]')?.addEventListener('click', () => {
      isEditingPolygon = false;
      renderParcelRow();
      refreshDeleteButton();
    });
  }

  function refreshDeleteButton() {
    const btn = externalActions?.querySelector('[data-act="delete"]');
    if (btn) btn.disabled = isEditingPolygon;
  }

  async function saveField(landId, fields) {
    hideError();
    const ok = await onSaveFields?.(landId, fields);
    refreshHeader(landId);
    return ok !== false;
  }

  function bindPanelEvents(land) {

    setupInlineTextField({
      wrapperId: 'lp-field-owner',
      type: 'input',
      placeholder: '例：田中一郎、または 中嶋幸子（持分1/2）・中嶋直美（持分1/2）',
      getValue: () => window.DataStore.formatOwners(land.owners),
      onConfirm: (next) => saveField(land.id, { owners: window.DataStore.parseOwners(next) }),
    });

    setupInlineTextField({
      wrapperId: 'lp-field-areaTsubo',
      type: 'number',
      placeholder: '例：45',
      getValue: () => land.areaTsubo,
      formatDisplay: (v) => `${v} 坪`,
      onConfirm: async (next) => {
        const trimmed = next.trim();
        if (trimmed === '') return saveField(land.id, { areaTsubo: 0 });
        const num = Number(trimmed);
        if (!Number.isFinite(num) || num < 0) { showError('坪数は 0 以上の数値で入力してください'); return false; }
        return saveField(land.id, { areaTsubo: num });
      },
    });

    setupInlineTextField({
      wrapperId: 'lp-field-description',
      type: 'textarea',
      placeholder: '例：家族構成・隣地との関係・接道状況など',
      getValue: () => land.description || '',
      onConfirm: (next) => saveField(land.id, { description: next.trim() }),
    });

    renderParcelRow();
    refreshDeleteButton();
    externalActions?.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
      if (isEditingPolygon) return;
      onDeleteLand?.(land.id);
    });

    host.querySelector('#lp-status-select')?.addEventListener('change', (e) => {
      const next = e.target.value;
      if (!STATUS_KEYS.includes(next)) return;
      saveField(land.id, { status: next });
    });
    // 訪問記録の追加は案件詳細画面（detail.html）に移管したため、edit.js には submit ハンドラを持たない。
  }

  function selectLandGuarded(landId) {
    if (isEditingPolygon) return;
    renderLand(landId);
  }

  // 外部から「選択中の土地のパネルを丸ごと再描画したい」とき用（筆の付け替え後など）。
  function refreshCurrent() {
    if (currentLandId) renderLand(currentLandId);
    else renderEmpty();
  }

  renderEmpty();
  return {
    selectLand: selectLandGuarded,
    clear: renderEmpty,
    currentId: () => currentLandId,
    refreshHeader,
    refreshCurrent,
    isEditingPolygon: () => isEditingPolygon,
  };
}

// ---------- 公図風ビュー（土地ポリゴンの SVG 表示・クリック選択） ----------
// 案件詳細画面と同じ見た目: 白地・北上の SVG に各 land の polygon をステータス色で描画し、
// 中心に地番・地権者・坪数ラベルを重ねる。筆クリックで onSelect(landId) を呼ぶ。
function setupKouzuView(hostId, proj, { onSelect } = {}) {
  const noop = { refresh: () => {}, selectLand: () => {}, destroy: () => {} };
  const host = document.getElementById(hostId);
  if (!host) return noop;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const polyByLandId = new Map();
  let selectedLandId = null;

  function selectLand(landId) {
    if (selectedLandId && polyByLandId.has(selectedLandId)) {
      polyByLandId.get(selectedLandId).classList.remove('selected');
    }
    selectedLandId = landId;
    if (landId && polyByLandId.has(landId)) {
      polyByLandId.get(landId).classList.add('selected');
    }
  }

  function build() {
    polyByLandId.clear();
    const lands = (proj.lands || []).filter(
      (l) => Array.isArray(l.polygon) && l.polygon.length >= 3
    );
    if (lands.length === 0) {
      host.innerHTML = '<div class="kouzu-empty">領域が設定された土地がありません。<br>右のパネルの「筆を選ぶ」で土地に筆を割り当ててください。</div>';
      return;
    }

    // 緯度経度 → ローカル平面メートル座標（重心緯度での正距円筒近似）。北が上。
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
    const hostRect = host.getBoundingClientRect();
    const fit = Math.min(
      Math.max(120, hostRect.width - 24) / viewW,
      Math.max(120, (hostRect.height || 480) - 24) / viewH
    );
    svg.setAttribute('width', (viewW * fit).toFixed(0));
    svg.setAttribute('height', (viewH * fit).toFixed(0));

    const tx = ([x, y]) => [x - minX + pad, y - minY + pad];

    // ラベル文字サイズは平均筆サイズ基準（単位はメートル）
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
        selectLand(land.id);
        onSelect?.(land.id);
      });
      polyByLandId.set(land.id, polygon);
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

    host.replaceChildren(svg);
    // 再構築後も選択中の筆のハイライトを引き継ぐ
    if (selectedLandId && polyByLandId.has(selectedLandId)) {
      polyByLandId.get(selectedLandId).classList.add('selected');
    }
  }

  build();

  return {
    refresh: build,
    selectLand,
    destroy: () => host.replaceChildren(),
  };
}

// ---------- 領域ポリゴン描画マップ ----------
function setupPolygonMap(containerId, initialPolygon, { onChange } = {}) {
  const POLY_STYLE = {
    color: '#065a82', weight: 3, opacity: 0.9,
    dashArray: '6 6', fillColor: '#065a82', fillOpacity: 0.12,
  };
  const defaultCenter = [35.71, 139.78];
  const m = L.map(containerId, {
    center: defaultCenter,
    zoom: 16,
    minZoom: 13,
    maxZoom: 22,
    zoomControl: true,
    attributionControl: false,
  });
  L.tileLayer('/tile/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(m);

  const drawnItems = new L.FeatureGroup().addTo(m);
  let currentLayer = null;
  let drawHandler = null;
  let editing = false;

  const statusEl = document.getElementById('poly-status');
  const drawBtn = document.getElementById('poly-draw');
  const clearBtn = document.getElementById('poly-clear');

  function updateStatus() {
    if (!currentLayer) {
      statusEl.textContent = '未設定';
      statusEl.className = 'save-status is-empty';
      drawBtn.textContent = '＋ ポリゴンを描く';
      clearBtn.style.display = 'none';
    } else if (editing) {
      statusEl.textContent = '編集中（頂点ドラッグで調整可）';
      statusEl.className = 'save-status is-saving';
      drawBtn.textContent = '描き直す';
      clearBtn.style.display = '';
    } else {
      statusEl.textContent = '設定済み';
      statusEl.className = 'save-status is-set';
      drawBtn.textContent = '描き直す';
      clearBtn.style.display = 'none';
    }
  }

  function getPolygonArray() {
    if (!currentLayer) return null;
    const ll = currentLayer.getLatLngs()[0] || [];
    if (ll.length < 3) return null;
    return ll.map(p => [p.lat, p.lng]);
  }

  function setReadonlyLayer(layer) {
    if (currentLayer) {
      try { currentLayer.editing.disable(); } catch (_) {}
      currentLayer.off('edit');
      drawnItems.removeLayer(currentLayer);
    }
    currentLayer = layer;
    editing = false;
    if (currentLayer) drawnItems.addLayer(currentLayer);
    updateStatus();
  }

  function adoptDrawnLayer(layer) {
    if (currentLayer) {
      try { currentLayer.editing.disable(); } catch (_) {}
      currentLayer.off('edit');
      drawnItems.removeLayer(currentLayer);
    }
    currentLayer = layer;
    editing = true;
    drawnItems.addLayer(currentLayer);
    try { currentLayer.editing.enable(); } catch (_) {}
    currentLayer.on('edit', () => {
      try { onChange?.(getPolygonArray()); } catch (e) { console.error(e); }
    });
    updateStatus();
  }

  function startDraw() {
    if (drawHandler) { try { drawHandler.disable(); } catch (_) {} drawHandler = null; }
    setReadonlyLayer(null);
    drawHandler = new L.Draw.Polygon(m, {
      shapeOptions: POLY_STYLE,
      allowIntersection: false,
      showArea: false,
    });
    drawHandler.enable();
    statusEl.textContent = '描画中 — 始点クリックで閉じる';
    statusEl.className = 'save-status is-saving';
    drawBtn.textContent = 'やり直す';
    clearBtn.style.display = '';
  }

  m.on(L.Draw.Event.CREATED, (e) => {
    drawHandler = null;
    adoptDrawnLayer(e.layer);
    try { onChange?.(getPolygonArray()); } catch (err) { console.error(err); }
  });
  m.on(L.Draw.Event.DRAWSTOP, () => { drawHandler = null; });

  drawBtn.addEventListener('click', startDraw);
  clearBtn.addEventListener('click', () => {
    if (drawHandler) { try { drawHandler.disable(); } catch (_) {} drawHandler = null; }
    setReadonlyLayer(null);
    try { onChange?.(null); } catch (e) { console.error(e); }
  });

  if (Array.isArray(initialPolygon) && initialPolygon.length >= 3) {
    const layer = L.polygon(initialPolygon, POLY_STYLE);
    setReadonlyLayer(layer);
    // ZENRIN タイルの最大ズーム（22）まで使い、ポリゴンが全部見える範囲で最大限拡大する
    try { m.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 22 }); } catch (_) {}
  } else {
    updateStatus();
  }

  setTimeout(() => m.invalidateSize(), 60);

  function destroy() {
    if (drawHandler) { try { drawHandler.disable(); } catch (_) {} }
    try { m.remove(); } catch (_) {}
  }

  return {
    getPolygon: getPolygonArray,
    destroy,
    remove: destroy,
  };
}

// ---------- 削除・土地新規作成 ----------
async function deleteProjectConfirm(projectId) {
  const proj = state.projects.find(p => p.id === projectId);
  if (!proj) return;
  const msg = proj.lands.length > 0
    ? `「${proj.name}」を削除します。\n含まれる ${proj.lands.length} 件の土地・訪問記録もすべて削除されます。\n本当によろしいですか？`
    : `「${proj.name}」を削除します。よろしいですか？`;
  if (!confirm(msg)) return;
  try {
    await window.DataStore.deleteProject(state.projects, projectId);
  } catch (e) {
    console.error(e);
    toast(`削除に失敗しました: ${e.message}`);
    return;
  }
  toast('案件を削除しました');
  window.location.href = 'index.html';
}

async function openLandCreateForm(projectId) {
  const proj = state.projects.find(p => p.id === projectId);
  if (!proj) return;

  // 町名一覧は遅延取得（初回のみ API。以後はキャッシュ）
  let towns;
  try {
    towns = await window.DataStore.parcelTowns();
  } catch (e) {
    console.error(e);
    toast(`町名一覧の取得に失敗しました: ${e.message}`);
    return;
  }

  const statusOptions = STATUS_KEYS.map(k =>
    `<option value="${k}" ${k === 'target' ? 'selected' : ''}>${STATUS_DEFS[k].label}</option>`
  ).join('');

  // 町名は案件内の既存の土地で最も使われているものを初期値にする
  const azaCounts = new Map();
  proj.lands.forEach(l => {
    if (l.aza) azaCounts.set(l.aza, (azaCounts.get(l.aza) || 0) + 1);
  });
  const defaultAza = [...azaCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  // 筆マスタからの選択のみ。存在しない土地は選択できず、土地は必ず領域を持つ。
  const body = `
    <div id="form-error" class="form-error" style="display:none"></div>
    <div class="form-grid-2">
      <div class="form-row">
        <label>町名・丁目</label>
        <select id="f-aza">${towns.map(t =>
          `<option value="${escHtml(t.name)}"${t.name === defaultAza ? ' selected' : ''}>${escHtml(t.name)}</option>`
        ).join('')}</select>
      </div>
      <div class="form-row">
        <label>地番 <span style="color:#ef4444">*</span></label>
        <select id="f-parcel" disabled></select>
      </div>
    </div>
    <div class="form-row">
      <label>ステータス</label>
      <select id="f-status">${statusOptions}</select>
    </div>
    <div class="hint">地番は筆マスタ（登記所備付地図データ）から選択します。領域・坪数は選んだ筆から自動設定されます。
    この案件にすでに追加済みの筆は表示されません。</div>
  `;

  const saveBtn = makeBtn('作成', 'btn-primary', async () => {
    const errEl = document.getElementById('form-error');
    errEl.style.display = 'none';

    const parcelId = document.getElementById('f-parcel').value;
    if (!parcelId) {
      errEl.textContent = '地番を選択してください';
      errEl.style.display = 'block';
      return;
    }

    const status = document.getElementById('f-status').value;
    try {
      await window.DataStore.createLand(state.projects, projectId, { parcelId, status });
    } catch (e) {
      // 筆マスタに存在しない地番・案件内での筆重複などはサーバが日本語メッセージで拒否する
      console.error(e);
      errEl.textContent = e.message;
      errEl.style.display = 'block';
      return;
    }
    toast('土地を追加しました（領域・坪数は筆マスタから自動設定）');
    closeModal();
    renderEdit();
  });

  openModal({
    title: '土地を追加',
    body,
    footer: [makeBtn('キャンセル', '', closeModal), saveBtn],
  });

  // 町名の選択に応じて地番プルダウンを入れ替える（筆一覧は町名単位で遅延取得。
  // 案件内で使用済みの筆は除外）
  const azaEl = document.getElementById('f-aza');
  const parcelEl = document.getElementById('f-parcel');
  let optionsToken = 0; // 町名を連続で切り替えたとき、古い応答で上書きしないためのトークン
  async function refreshParcelOptions() {
    if (!parcelEl || !azaEl) return;
    const token = ++optionsToken;
    parcelEl.disabled = true;
    parcelEl.innerHTML = '<option value="">読み込み中…</option>';
    let parcels;
    try {
      parcels = await window.DataStore.parcelsByTown(azaEl.value);
    } catch (e) {
      console.error(e);
      if (token === optionsToken && parcelEl.isConnected) {
        parcelEl.innerHTML = '<option value="">（筆一覧の取得に失敗）</option>';
      }
      return;
    }
    if (token !== optionsToken || !parcelEl.isConnected) return;
    const usedIds = new Set(proj.lands.map(l => l.parcelId));
    const avail = parcels.filter(p => !usedIds.has(p.parcelId));
    parcelEl.innerHTML = avail.length
      ? avail.map(p => `<option value="${escHtml(p.parcelId)}">${escHtml(p.chiban)}</option>`).join('')
      : '<option value="">（この町名の筆はすべて追加済み）</option>';
    parcelEl.disabled = false;
  }
  azaEl?.addEventListener('change', refreshParcelOptions);
  refreshParcelOptions();

  setTimeout(() => { document.getElementById('f-parcel')?.focus(); }, 50);
}

async function deleteLandConfirm(projectId, landId) {
  const proj = state.projects.find(p => p.id === projectId);
  const land = proj?.lands.find(l => l.id === landId);
  if (!land) return;
  const cnt = land.visits?.length || 0;
  const msg = cnt > 0
    ? `「${land.chiban}」を削除します。\n${cnt} 件の訪問記録もすべて削除されます。\nよろしいですか？`
    : `「${land.chiban}」を削除します。よろしいですか？`;
  if (!confirm(msg)) return;
  try {
    await window.DataStore.deleteLand(state.projects, projectId, landId);
  } catch (e) {
    console.error(e);
    toast(`削除に失敗しました: ${e.message}`);
    return;
  }
  toast('土地を削除しました');
  renderEdit();
}

// ---------- 起動 ----------
(async function bootstrap() {
  try {
    await initAppState();
  } catch (e) {
    console.error(e);
    $('main').innerHTML = `<div class="card">データの読み込みに失敗しました: ${escHtml(e.message)}</div>`;
    return;
  }
  renderEdit();
})();
