// ============================================================
// 共有データレイヤー（全画面で使用）
// PostgreSQL バックエンド（proxy.py の /api/*）への API クライアント。
//   - 案件・土地・訪問記録は正規化テーブルに永続化され、CRUD ごとに API を呼ぶ
//   - 筆マスタ（約5.1万筆）は全件を読まず、町名一覧（/api/parcel-towns）と
//     町名単位の筆一覧（/api/parcels?town=…）を必要時に遅延取得してキャッシュする。
//     土地の領域・坪数・町名・地番はサーバが筆マスタから導出するため、
//     クライアントは筆のジオメトリを一切持たない
//   - CRUD メソッドはすべて async。サーバ応答を正としてローカルの
//     projects 配列へ反映するため、画面側の描画コードはそのまま使える
// ============================================================

(function (global) {
  // ---------- API ヘルパー ----------
  // 失敗時はサーバの {error} メッセージ（日本語）を Error として投げる。
  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data && data.error) msg = data.error;
      } catch (_) { /* JSON でないエラー応答はステータスのまま */ }
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ---------- 筆マスタ（町名単位の遅延取得キャッシュ） ----------
  // マスタは静的なので、一度取得した町名一覧・町ごとの筆一覧はセッション中ずっと使い回す。
  let _towns = null;                  // [{ name, count }]
  const _parcelsByTown = new Map();   // 町名 → [{ parcelId, chiban }]（地番の自然順）

  // 地番の自然順ソートキー（例: 2-10 は 2-9 の後）
  function chibanSortKey(chiban) {
    const [main, branch] = String(chiban).split('-');
    return (Number(main) || 0) * 100000 + (Number(branch) || 0);
  }

  // 町名（大字+丁目・半角正規化済み）の一覧。土地追加モーダル・筆変更プルダウンに使う。
  async function parcelTowns() {
    if (!_towns) {
      const towns = await api('GET', '/api/parcel-towns');
      towns.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
      _towns = towns;
    }
    return _towns;
  }

  // 指定町名の筆一覧（属性のみ）。初回のみ API を呼び、以後はキャッシュを返す。
  async function parcelsByTown(name) {
    if (!_parcelsByTown.has(name)) {
      const parcels = await api('GET', `/api/parcels?town=${encodeURIComponent(name)}`);
      parcels.sort((a, b) => chibanSortKey(a.chiban) - chibanSortKey(b.chiban));
      _parcelsByTown.set(name, parcels);
    }
    return _parcelsByTown.get(name);
  }

  // ---------- 幾何ヘルパー ----------

  // [[lat,lng]] ポリゴンの面積を坪で返す（重心緯度での平面近似 + 靴ひも公式）。
  // 数十〜数百mスケールの筆なら十分な精度。
  function polygonAreaTsubo(latlngs) {
    if (!Array.isArray(latlngs) || latlngs.length < 3) return 0;
    const lat0 = latlngs.reduce((s, p) => s + p[0], 0) / latlngs.length;
    const lng0 = latlngs[0][1];
    const M_PER_LAT = 111320;
    const mPerLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const pts = latlngs.map(([lat, lng]) => [(lng - lng0) * mPerLng, (lat - lat0) * M_PER_LAT]);
    let area2 = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      area2 += x1 * y2 - x2 * y1;
    }
    const sqm = Math.abs(area2) / 2;
    return Math.round((sqm / 3.305785) * 100) / 100;
  }

  // ---------- ローカル配列への反映ヘルパー ----------
  const findProject = (projects, projectId) => projects.find((p) => p.id === projectId);
  const findLand = (proj, landId) => proj?.lands.find((l) => l.id === landId);

  const DataStore = {
    STATUS_DEFS: {
      target:   { label: '対象',   color: '#94a3b8', cls: 'status-target' },
      acquired: { label: '取得済', color: '#10b981', cls: 'status-acquired' },
    },

    polygonAreaTsubo,
    parcelTowns,
    parcelsByTown,

    // ----- 地権者ヘルパ -----
    // owners 配列を表示用文字列に整形する。
    // 例: [{name:'中嶋幸子',share:'1/2'},{name:'中嶋直美',share:'1/2'}]
    //     → '中嶋幸子（持分1/2）・中嶋直美（持分1/2）'
    // share が空なら持分表記を省略。
    formatOwners(owners) {
      if (!Array.isArray(owners) || owners.length === 0) return '';
      return owners
        .map((o) => (o.share ? `${o.name}（持分${o.share}）` : o.name))
        .join('・');
    },

    // 表示用文字列を owners 配列にパースする。formatOwners の逆。
    // 区切り文字は ・ または 、または ,。share は「（持分X）」or「(持分X)」or「（X）」など緩めに対応。
    parseOwners(text) {
      const src = (text || '').trim();
      if (!src) return [];
      return src
        .split(/[・、,]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const m = part.match(/^(.+?)\s*[（(](?:持分)?\s*(.+?)\s*[）)]\s*$/);
          return m ? { name: m[1].trim(), share: m[2].trim() } : { name: part, share: '' };
        });
    },

    // 全案件（lands・visits 込みのツリー）を取得する。
    // 筆マスタはここでは読まない（プルダウンを開いたときに町名単位で遅延取得する）。
    // サンプルデータの初回投入はサーバ起動時に行われる。
    async load() {
      return api('GET', '/api/projects');
    },

    // 案件・土地・訪問記録を破棄してサンプルデータを再投入する（筆マスタは残る）。
    async reset() {
      await api('POST', '/api/reset');
    },

    // ----- CRUD（サーバが正本。成功応答をローカル配列へ反映して返す） -----

    async createProject(projects, fields) {
      const proj = await api('POST', '/api/projects', {
        name: fields.name || '',
        description: fields.description || '',
        polygon: fields.polygon || null,
      });
      projects.push(proj);
      return proj;
    },

    async updateProject(projects, projectId, fields) {
      const updated = await api('PATCH', `/api/projects/${encodeURIComponent(projectId)}`, fields);
      const proj = findProject(projects, projectId);
      if (!proj) return updated;
      Object.assign(proj, updated); // 応答に lands は含まれないのでローカルの lands は保持される
      return proj;
    },

    async deleteProject(projects, projectId) {
      await api('DELETE', `/api/projects/${encodeURIComponent(projectId)}`);
      const idx = projects.findIndex((p) => p.id === projectId);
      if (idx >= 0) projects.splice(idx, 1);
      return true;
    },

    // 土地の作成は筆マスタの parcelId 必須。マスタに存在しない筆・案件内で
    // 重複する筆はサーバが拒否する（エラーメッセージをそのまま throw する）。
    async createLand(projects, projectId, fields) {
      const land = await api('POST', `/api/projects/${encodeURIComponent(projectId)}/lands`, {
        parcelId: fields.parcelId,
        status: fields.status || 'target',
        owners: fields.owners || [],
        description: fields.description || '',
      });
      findProject(projects, projectId)?.lands.push(land);
      return land;
    },

    async updateLand(projects, projectId, landId, fields) {
      const updated = await api(
        'PATCH',
        `/api/projects/${encodeURIComponent(projectId)}/lands/${encodeURIComponent(landId)}`,
        fields
      );
      const land = findLand(findProject(projects, projectId), landId);
      if (!land) return updated;
      Object.assign(land, updated); // 応答に visits は含まれないのでローカルの visits は保持される
      return land;
    },

    async deleteLand(projects, projectId, landId) {
      await api(
        'DELETE',
        `/api/projects/${encodeURIComponent(projectId)}/lands/${encodeURIComponent(landId)}`
      );
      const proj = findProject(projects, projectId);
      const idx = proj ? proj.lands.findIndex((l) => l.id === landId) : -1;
      if (idx >= 0) proj.lands.splice(idx, 1);
      return true;
    },

    async addVisit(projects, projectId, landId, fields) {
      const visit = await api(
        'POST',
        `/api/projects/${encodeURIComponent(projectId)}/lands/${encodeURIComponent(landId)}/visits`,
        fields
      );
      const land = findLand(findProject(projects, projectId), landId);
      if (land) {
        land.visits.push(visit);
        // 訪問追加も土地の活動なのでサーバ側で更新日が進む。表示用に近似値で追随する
        land.updatedAt = visit.date;
      }
      return visit;
    },
  };

  global.DataStore = DataStore;
})(window);
