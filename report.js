// ============================================================
// 業務報告シート画面
//   - 全案件 × 全土地 × 全訪問記録を「行」として展開し、
//     PDF版 業務報告シート（所在地・案件名・地権者名・日付・時間・
//     種別・担当・商談形式・対面確度・次回予定日・次回商談形式・
//     コメント・進捗・URL）と同じ列構成で表示する。
//   - 案件名・担当でフィルタ可能。
//   - 案件指定で開きたい場合は ?projectId=xxx を URL に付ける。
// ============================================================

const $ = (id) => document.getElementById(id);
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}/${pad(dt.getMonth() + 1)}/${pad(dt.getDate())}`;
};
const fmtTime = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

// 進捗状況に応じて色クラスを切り替える。
//   B          → 黄色ピル（注力中）
//   初期見込み → グレーピル（中立）
//   それ以外は中立色。
function rankPill(progress) {
  if (!progress) return '<span class="muted">—</span>';
  const cls = (progress === 'A' || progress === 'B' || progress === 'C' || progress === 'D')
    ? `rank-${progress}` : 'rank-other';
  return `<span class="rank-pill ${cls}">${escHtml(progress)}</span>`;
}

function muted(value) {
  return value
    ? escHtml(value)
    : '<span class="muted">—</span>';
}

// 主権者区分: 訪問単位の principal 値から表示ラベルを返す。
//   'principal'     → 主権者
//   'non_principal' → 非主権者
//   'other'         → その他
// 未指定（空文字・null・undefined）は既定で「主権者」とする。
const PRINCIPAL_LABELS = {
  principal: '主権者',
  non_principal: '非主権者',
  other: 'その他',
};
function principalLabel(principal) {
  return PRINCIPAL_LABELS[principal] || PRINCIPAL_LABELS.principal;
}

const projects = window.DataStore.load();

// ---------- 行データの組み立て ----------
// 各土地について「最新訪問 1 件」のみを行に展開する。
// 業務報告シートは現況サマリ用途なので、最新だけ残す方が読みやすい。
// 訪問記録が 1 件もない土地は行を出さない。
function buildRows() {
  const rows = [];
  projects.forEach((proj) => {
    (proj.lands || []).forEach((land) => {
      const visits = (land.visits || []);
      if (visits.length === 0) return;
      const latest = visits.reduce((best, v) => {
        if (!best) return v;
        return new Date(v.date) > new Date(best.date) ? v : best;
      }, null);
      rows.push({ proj, land, visit: latest });
    });
  });
  return rows;
}

// ---------- フィルタ初期化 ----------
function initFilters(allRows) {
  // 案件
  const projSel = $('filter-project');
  projects.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    projSel.appendChild(opt);
  });
  // 担当（重複排除）
  const userSel = $('filter-user');
  const users = Array.from(new Set(allRows.map((r) => r.visit.user).filter(Boolean))).sort();
  users.forEach((u) => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    userSel.appendChild(opt);
  });

  // URL クエリで初期値を反映
  const params = new URLSearchParams(window.location.search);
  const initialProj = params.get('projectId');
  if (initialProj) projSel.value = initialProj;

  projSel.addEventListener('change', render);
  userSel.addEventListener('change', render);
}

// ---------- 描画 ----------
function render() {
  const projFilter = $('filter-project').value;
  const userFilter = $('filter-user').value;

  const filtered = buildRows().filter((r) => {
    if (projFilter && r.proj.id !== projFilter) return false;
    if (userFilter && r.visit.user !== userFilter) return false;
    return true;
  });

  // 日付の新しい順に並べる
  filtered.sort((a, b) => new Date(b.visit.date) - new Date(a.visit.date));

  const tbody = $('report-tbody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="empty-row">該当する訪問記録がありません。本部管理画面で土地・訪問記録を追加してください。</td></tr>';
    $('row-count').textContent = '';
    return;
  }
  $('row-count').textContent = `${filtered.length} 件`;

  tbody.innerHTML = filtered.map(({ proj, land, visit: v }) => `
    <tr>
      <td>${muted(proj.address)}</td>
      <td>${escHtml(proj.name)}</td>
      <td>${escHtml(window.DataStore.formatOwners(land.owners) || '—')}</td>
      <td class="nowrap mono">${escHtml(fmtDate(v.date)) || '<span class="muted">—</span>'}</td>
      <td class="nowrap mono">${escHtml(fmtTime(v.date)) || '<span class="muted">—</span>'}</td>
      <td class="nowrap" style="text-align:center">${muted(v.directOrTel)}</td>
      <td>${escHtml(v.user)}</td>
      <td>${muted(v.meetingType)}</td>
      <td class="nowrap" style="text-align:center">${principalLabel(v.principal)}</td>
      <td class="nowrap mono">${v.nextDate ? escHtml(fmtDate(v.nextDate)) : '<span class="muted">—</span>'}</td>
      <td class="nowrap mono">${v.nextDate ? escHtml(fmtTime(v.nextDate)) : '<span class="muted">—</span>'}</td>
      <td>${escHtml(v.comment || '')}</td>
      <td class="nowrap">${rankPill(v.progress)}</td>
    </tr>
  `).join('');
}

// ---------- 起動 ----------
initFilters(buildRows());
render();

// 「サンプルデータに戻す」ボタンのリスナー（4 画面共通仕様）。
document.getElementById('btn-reset')?.addEventListener('click', () => {
  if (!confirm('localStorage を削除し、サンプルデータに戻します。よろしいですか？')) return;
  window.DataStore.reset();
  window.location.reload();
});
