// ============================================================
// 共通ヘルパー（案件一覧 / 案件編集の両画面で使用）
//   - 定数・state・整形ユーティリティ
//   - トースト / モーダル基盤
//   - インライン編集（鉛筆 → ✓/✕）ヘルパー
// 両画面の HTML から data.js → common.js → 各画面 JS の順で読み込む。
// ============================================================

const STATUS_DEFS = window.DataStore.STATUS_DEFS;
const STATUS_KEYS = ['target', 'acquired'];

// 全画面共有の状態。projects 配列は localStorage に永続化される。
// 画面ルート（一覧 / 編集）は別ファイル化したため、ここでは保持しない。
const state = {
  projects: window.DataStore.load(),
};

// ---------- ヘルパー ----------
const $ = (id) => document.getElementById(id);
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  const pad = (n) => String(n).padStart(2,'0');
  return `${dt.getFullYear()}/${pad(dt.getMonth()+1)}/${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};
const fmtDateOnly = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return `${dt.getFullYear()}/${dt.getMonth()+1}/${dt.getDate()}`;
};

function persist() {
  window.DataStore.save(state.projects);
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2000);
}

function countLandStatuses(proj) {
  const c = { target: 0, acquired: 0 };
  proj.lands.forEach(l => { c[l.status] = (c[l.status] || 0) + 1; });
  return c;
}

function totalAreaTsubo(proj) {
  return proj.lands.reduce((s, l) => s + (Number(l.areaTsubo) || 0), 0);
}

// 案件のステータス積み上げセグメントバーを返す。
// `compact` オプションをつけるとテーブル行内向けの小型サイズに。
function renderStatusBar(proj, { compact = false } = {}) {
  const total = proj.lands.length;
  const c = countLandStatuses(proj);
  const cls = compact ? ' compact' : '';
  if (total === 0) {
    return `<div class="progress-bar${cls}"><div class="seg empty" style="flex:1"></div></div>`;
  }
  // 進捗バーは左から右へ「達成済 → 残り」の順に並べる方が直感的なので、
  // 表示順は STATUS_KEYS とは独立に acquired → target で固定する。
  const segs = ['acquired', 'target'].map(k => {
    const n = c[k];
    if (n === 0) return '';
    return `<div class="seg ${STATUS_DEFS[k].cls}" style="flex:${n}" title="${STATUS_DEFS[k].label} ${n}件"></div>`;
  }).join('');
  return `<div class="progress-bar${cls}">${segs}</div>`;
}

// ---------- 「サンプルデータに戻す」 ----------
// 両画面のトップバーに同じ id="btn-reset" のボタンがある。
// localStorage をクリアしてサンプルを再生成 → 現在の URL のままリロードする。
$('btn-reset').addEventListener('click', () => {
  if (!confirm('localStorage を削除し、サンプルデータに戻します。よろしいですか？')) return;
  window.DataStore.reset();
  toast('サンプルデータに戻しました');
  setTimeout(() => window.location.reload(), 500);
});

// ---------- モーダル基盤 ----------
let modalCleanup = null;

function openModal({ title, body, footer, wide = false, onClose = null }) {
  if (modalCleanup) { try { modalCleanup(); } catch (_) {} modalCleanup = null; }
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = body;
  $('modal-footer').innerHTML = '';
  footer.forEach(b => $('modal-footer').appendChild(b));
  $('modal-box').classList.toggle('wide', wide);
  $('modal').classList.add('show');
  modalCleanup = onClose;
}
function closeModal() {
  if (modalCleanup) { try { modalCleanup(); } catch (_) {} modalCleanup = null; }
  $('modal').classList.remove('show');
}
$('modal-close').addEventListener('click', closeModal);
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) closeModal();
});

function makeBtn(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = `btn ${cls || ''}`;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// ---------- インライン編集（鉛筆ボタン → ✓/✕） ----------
const PENCIL_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

// テキスト・数値・複数行系フィールドの鉛筆 → 入力 → 確定／取消 を制御するヘルパー。
//
// type:
//   'input'    — 単一行テキスト
//   'textarea' — 複数行テキスト
//   'number'   — 数値（空欄可・min=0・step=0.1）
//
// formatDisplay(value): 表示モードでの整形（例：坪数に「坪」を付けるなど）。省略時は素の値。
// onConfirm(newValue) が `false` を返した場合はバリデーション失敗として編集モードを継続する。
function setupInlineTextField({ wrapperId, type, placeholder, getValue, onConfirm, formatDisplay }) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;

  function renderRead() {
    const v = getValue();
    const isEmpty = v === '' || v == null;
    const display = isEmpty
      ? '未設定'
      : (formatDisplay ? formatDisplay(v) : String(v));
    wrapper.innerHTML = `
      <div class="field-display ${isEmpty ? 'empty' : ''}">${escHtml(display)}</div>
      <button type="button" class="field-icon-btn" data-act="edit" aria-label="編集" title="編集">${PENCIL_SVG}</button>
    `;
    wrapper.querySelector('[data-act="edit"]').addEventListener('click', renderEdit);
  }

  function renderEdit() {
    const v = getValue();
    const valueAttr = v == null ? '' : String(v);
    let tag;
    if (type === 'textarea') {
      tag = `<textarea rows="3" placeholder="${escHtml(placeholder || '')}">${escHtml(valueAttr)}</textarea>`;
    } else if (type === 'number') {
      tag = `<input type="number" min="0" step="0.1" placeholder="${escHtml(placeholder || '')}" value="${escHtml(valueAttr)}">`;
    } else {
      tag = `<input type="text" placeholder="${escHtml(placeholder || '')}" value="${escHtml(valueAttr)}">`;
    }
    wrapper.innerHTML = `
      ${tag}
      <div class="field-actions">
        <button type="button" class="field-icon-btn confirm" data-act="confirm" aria-label="保存" title="保存">✓</button>
        <button type="button" class="field-icon-btn cancel" data-act="cancel" aria-label="取消" title="取消">✕</button>
      </div>
    `;
    const ctrl = wrapper.querySelector('input, textarea');
    ctrl.focus();
    if (ctrl.select) try { ctrl.select(); } catch (_) {}

    function tryConfirm() {
      const ok = onConfirm(ctrl.value);
      if (ok === false) {
        ctrl.classList.add('invalid');
        ctrl.focus();
        return;
      }
      renderRead();
    }

    ctrl.addEventListener('input', () => ctrl.classList.remove('invalid'));
    ctrl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); renderRead(); }
      else if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); tryConfirm(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && type === 'textarea') { e.preventDefault(); tryConfirm(); }
    });
    wrapper.querySelector('[data-act="confirm"]').addEventListener('click', tryConfirm);
    wrapper.querySelector('[data-act="cancel"]').addEventListener('click', renderRead);
  }

  renderRead();
}

// セレクト系フィールドの鉛筆 → セレクト → 確定／取消。
// options: [{ value, label, displayHtml? }]。displayHtml は読み取り表示時の HTML（ステータスのピル等）。
function setupInlineSelectField({ wrapperId, options, getValue, onConfirm }) {
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;

  function renderRead() {
    const v = getValue();
    const opt = options.find(o => o.value === v);
    const display = opt ? (opt.displayHtml || escHtml(opt.label)) : '<span class="empty">未設定</span>';
    wrapper.innerHTML = `
      <div class="field-display">${display}</div>
      <button type="button" class="field-icon-btn" data-act="edit" aria-label="編集" title="編集">${PENCIL_SVG}</button>
    `;
    wrapper.querySelector('[data-act="edit"]').addEventListener('click', renderEdit);
  }

  function renderEdit() {
    const v = getValue();
    const optsHtml = options
      .map(o => `<option value="${escHtml(o.value)}" ${o.value === v ? 'selected' : ''}>${escHtml(o.label)}</option>`)
      .join('');
    wrapper.innerHTML = `
      <select>${optsHtml}</select>
      <div class="field-actions">
        <button type="button" class="field-icon-btn confirm" data-act="confirm" aria-label="保存" title="保存">✓</button>
        <button type="button" class="field-icon-btn cancel" data-act="cancel" aria-label="取消" title="取消">✕</button>
      </div>
    `;
    const ctrl = wrapper.querySelector('select');
    ctrl.focus();

    function tryConfirm() {
      const ok = onConfirm(ctrl.value);
      if (ok === false) { ctrl.focus(); return; }
      renderRead();
    }

    ctrl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); renderRead(); }
      else if (e.key === 'Enter') { e.preventDefault(); tryConfirm(); }
    });
    wrapper.querySelector('[data-act="confirm"]').addEventListener('click', tryConfirm);
    wrapper.querySelector('[data-act="cancel"]').addEventListener('click', renderRead);
  }

  renderRead();
}
