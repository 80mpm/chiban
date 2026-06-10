// ============================================================
// 共有データレイヤー（閲覧画面 / 管理画面の両方で使用）
// localStorage 永続化 + サンプルデータ初期化
// ============================================================

(function (global) {
  // v3: 土地は筆マスタ（kouzu_xml_data.js）への参照 (parcelId) で紐付く。
  // 町名 (aza)・地番 (chiban)・領域 (polygon) はマスタから導出するため、
  // 「領域のない土地」「マスタに存在しない土地」は構造上ありえない。
  const STORAGE_KEY = 'chibanDemoData_v3';
  const SCHEMA_VERSION = 3;

  function uuid() {
    return 'id_' + Math.random().toString(36).slice(2, 10);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function loadRaw() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SCHEMA_VERSION) return null;
      return parsed;
    } catch (e) {
      console.warn('localStorage 読み込み失敗:', e);
      return null;
    }
  }

  function saveRaw(projects) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: SCHEMA_VERSION, projects })
      );
    } catch (e) {
      console.warn('localStorage 保存失敗:', e);
    }
  }

  // ---------- 筆マスタ（kouzu_xml_data.js）ヘルパー ----------

  // 表示用: 全角数字を半角に（例: 西浅草２丁目 → 西浅草2丁目）
  function toHalfWidthDigits(s) {
    return String(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  }

  function masterFeatures() {
    return global.KOUZU_XML_DATA?.geojson?.features || [];
  }

  // parcelId（図面ID:地番）から筆 Feature を引く
  function parcelById(parcelId) {
    if (!parcelId) return null;
    return masterFeatures().find((f) => f.properties.parcelId === parcelId) || null;
  }

  // 筆 Feature の GeoJSON リング（[lng,lat]・末尾は始点の繰り返し）→ [[lat,lng]]
  function parcelRing(f) {
    return f.geometry.coordinates[0].slice(0, -1).map(([lng, lat]) => [lat, lng]);
  }

  // 筆 Feature の町名（大字+丁目。半角正規化済み）
  function parcelAza(f) {
    return toHalfWidthDigits(f.properties.oaza + (f.properties.chome || ''));
  }

  // 地番の自然順ソートキー（例: 2-10 は 2-9 の後）
  function chibanSortKey(chiban) {
    const [main, branch] = String(chiban).split('-');
    return (Number(main) || 0) * 100000 + (Number(branch) || 0);
  }

  // 町名ごとの筆一覧: [{ name, parcels: [{ parcelId, chiban }] }]
  // 土地追加モーダル・筆変更プルダウンの選択肢に使う。
  function parcelAreas() {
    const byArea = new Map();
    masterFeatures().forEach((f) => {
      const name = parcelAza(f);
      if (!byArea.has(name)) byArea.set(name, []);
      byArea.get(name).push({ parcelId: f.properties.parcelId, chiban: f.properties.chiban });
    });
    return [...byArea.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
      .map(([name, parcels]) => ({
        name,
        parcels: parcels.sort((a, b) => chibanSortKey(a.chiban) - chibanSortKey(b.chiban)),
      }));
  }

  // 筆 Feature から土地の導出フィールドを組み立てる
  function derivedLandFields(f) {
    const polygon = parcelRing(f);
    return {
      aza: parcelAza(f),
      chiban: f.properties.chiban,
      polygon,
    };
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

  // 点群の凸包（Andrew's monotone chain）。案件領域をサンプル土地群から自動生成する。
  function convexHull(points) {
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
  }

  // ---------- サンプルデータ ----------
  // 登記所備付地図データ（kouzu_xml_data.js）の実筆ポリゴンから案件・土地を組み立てる。
  // 土地の polygon は [[lat,lng]]、坪数はポリゴン面積から自動計算する。
  function makeSampleProjects() {
    const t = (days) => new Date(Date.now() - 86400000 * days).toISOString();
    const tAt = (days, hour, minute = 0) => {
      const d = new Date(Date.now() - 86400000 * days);
      d.setHours(hour, minute, 0, 0);
      return d.toISOString();
    };

    const kouzu = global.KOUZU_XML_DATA;
    if (!kouzu || !kouzu.geojson) {
      console.warn('KOUZU_XML_DATA が読み込まれていないため、サンプル案件を生成できません');
      return [];
    }
    // GeoJSON の [lng,lat]（末尾は始点の繰り返し）→ [[lat,lng]] に変換
    const ringOf = (f) => f.geometry.coordinates[0].slice(0, -1).map(([lng, lat]) => [lat, lng]);
    const featuresOf = (sheetId) =>
      kouzu.geojson.features.filter((f) => f.properties.sheetId === sheetId);

    // ダミー地権者名プール（実データの所有者情報は地図データに含まれないため架空の名前を割り当てる）
    const OWNER_POOL = [
      '佐藤誠一', '鈴木美津子', '高橋豊', '田中靖子', '伊藤博', '渡辺久美子',
      '山本健二', '中村文夫', '小林千代', '加藤正義', '吉田春子', '山田隆',
      '佐々木幸雄', '山口和子', '松本守', '井上静江', '木村洋一', '林芳子',
      '斎藤勝', '清水トミ', '森田一郎', '池田梅子',
    ];

    // 実筆 1 件 → 土地 1 件。overrides で地権者・ステータス・訪問などの演出を上書きする。
    const landFromFeature = (f, idx, overrides = {}) => {
      const derived = derivedLandFields(f);
      return Object.assign({
        id: uuid(),
        parcelId: f.properties.parcelId,
        aza: derived.aza,
        chiban: derived.chiban,
        owners: [{ name: OWNER_POOL[idx % OWNER_POOL.length], share: '' }],
        description: '',
        areaTsubo: polygonAreaTsubo(derived.polygon),
        status: 'target',
        polygon: derived.polygon,
        createdAt: t(9),
        updatedAt: t(2),
        visits: [],
      }, overrides);
    };

    // 案件 1 件分を実筆群から組み立てる。領域ポリゴンは全筆頂点の凸包。
    const buildProject = (id, sheetId, meta, landOverrides = new Map()) => {
      const feats = featuresOf(sheetId);
      const lands = feats.map((f, i) => landFromFeature(f, i, landOverrides.get(i) || {}));
      const allPts = lands.flatMap((l) => l.polygon);
      return Object.assign({
        id,
        createdAt: t(10),
        updatedAt: t(1),
        polygon: allPts.length >= 3 ? convexHull(allPts) : null,
        frontRoads: [],
        lands,
      }, meta);
    };

    // ----- 案件1: 新東京旅館（西浅草2-4-8） -----
    // 4筆とも登記所備付地図の実筆（西浅草2丁目図面・任意座標系を近似ジオリファレンスしたもの）。
    // kouzu_xml_data.js に sheetId '13106-0105-65'（approx: true）として同梱されている。
    const BASE_POLYGON = [
      [35.712527309087434, 139.78921696543694],
      [35.71248974141639,  139.78941813111305],
      [35.71239064979333,  139.78940404951575],
      [35.712409978114074, 139.78932894766334],
      [35.71233810940472,  139.78930748999122],
      [35.712346820766875, 139.7892585396767],
      [35.71236424348836,  139.78926457464698],
      [35.712384932965136, 139.78917472064495],
    ];
    const nishiAsakusaLand = (chiban, overrides = {}) => {
      const f = parcelById(`13106-0105-65:${chiban}`);
      if (!f) {
        console.warn(`筆マスタに 西浅草2丁目 ${chiban} が見つかりません`);
        return null;
      }
      return landFromFeature(f, 0, Object.assign({ owners: [] }, overrides));
    };
    const shinTokyoRyokan = {
      id: '1',
      name: '新東京旅館',
      description: '駅東口・商業地のオフィスビル建設用地として、隣接する4筆をまとめて地上げ',
      createdAt: t(10),
      updatedAt: t(1),
      polygon: BASE_POLYGON,
      address: '東京都台東区西浅草2-4-8',
      access: '東京メトロ銀座線「田原町」駅 徒歩5分 / つくばエクスプレス「浅草」駅 徒歩5分',
      currentFar: 500,
      targetFar: 457,
      frontRoads: [
        { edgeIndex: 0, width: 6 },
        { edgeIndex: 1, width: 6 },
      ],
      lands: [
        nishiAsakusaLand('24-3', {
          owners: [{ name: '安野政子', share: '' }],
          description: '個人名義（安野氏）。世帯主と早期に条件合意し、所有権移転登記まで完了済み',
          status: 'acquired',
          createdAt: t(8),
          updatedAt: t(3),
          visits: [
            { id: uuid(), user: '木村', comment: '初回訪問。安野様にご挨拶し、再開発計画の概要を説明。本人は売却に前向き。',
              date: t(8), directOrTel: '直', meetingType: '面談(対面)',
              nextDate: t(5), progress: 'B', principal: 'principal' },
            { id: uuid(), user: '木村', comment: '条件合意。売買契約締結・所有権移転登記完了。',
              date: t(3), directOrTel: '直', meetingType: '面談(対面)',
              nextDate: '', progress: '初期見込み', principal: 'principal' },
          ],
        }),
        nishiAsakusaLand('23-1', {
          owners: [
            { name: '中嶋幸子', share: '1520/6755' },
            { name: '中嶋直美', share: '5235/6755' },
          ],
          description: '中嶋家2名の共有名義（持分比は不均等）。主たる持分を握る中嶋直美氏が窓口となり、所有権移転登記完了',
          status: 'acquired',
          createdAt: t(6),
          updatedAt: t(6),
          visits: [{ id: uuid(), user: '木村', comment: '持分の多い中嶋直美氏が窓口となり、共有者全員から押印取得。所有権移転登記完了。',
            date: t(6), directOrTel: '直', meetingType: '面談(対面)',
            nextDate: '', progress: '初期見込み', principal: 'principal' }],
        }),
        nishiAsakusaLand('24-6', {
          owners: [{ name: '安野政子', share: '' }],
          description: '個人名義（安野氏）の小規模筆。隣地 24-3 と一体活用を前提に交渉、スムーズに取得完了',
          status: 'acquired',
          createdAt: t(7),
          updatedAt: t(4),
          visits: [{ id: uuid(), user: '本田', comment: '24-3 取得を踏まえ、隣接小筆として安野様と再協議。条件合意・所有権移転登記完了。',
            date: t(4), directOrTel: 'TEL', meetingType: '面談(ITP)',
            nextDate: '', progress: '初期見込み', principal: 'principal' }],
        }),
        nishiAsakusaLand('24-5', {
          owners: [{ name: '株式会社メイクス', share: '' }],
          description: '法人名義。代表と面談中、社内決裁を待っている段階',
          status: 'target',
          createdAt: t(4),
          updatedAt: t(1),
          visits: [
            { id: uuid(), user: '本田', comment: '初回訪問。代表に再開発の趣旨を説明、社内検討のため資料を持ち帰り。',
              date: t(4), directOrTel: '直', meetingType: '面談(対面)',
              nextDate: t(2), progress: '初期見込み', principal: 'principal' },
            { id: uuid(), user: '木村', comment: '代表より社内決裁待ちとの回答。次回は最終条件を提示予定。',
              date: t(1), directOrTel: 'TEL', meetingType: '面談(ITP)',
              nextDate: tAt(-2, 15, 30), progress: 'B', principal: 'non_principal' },
          ],
        }),
      ].filter(Boolean),
    };

    // ----- 案件2: 根岸三丁目計画（区画整理地区・22筆・実筆） -----
    const negishiOverrides = new Map([
      [0, {
        status: 'acquired',
        updatedAt: t(5),
        visits: [{ id: uuid(), user: '佐藤', comment: '地権者と条件合意。売買契約締結・所有権移転登記完了。',
          date: t(5), directOrTel: '直', meetingType: '面談(対面)',
          nextDate: '', progress: '初期見込み', principal: 'principal' }],
      }],
      [5, { status: 'acquired', updatedAt: t(5) }],
      [9, { status: 'acquired', updatedAt: t(4) }],
    ]);

    // ----- 案件2: 上野三丁目計画（8筆） -----
    const uenoOverrides = new Map([
      [0, {
        status: 'acquired',
        updatedAt: t(3),
        visits: [{ id: uuid(), user: '佐藤', comment: '地権者と条件合意。売買契約締結・所有権移転登記完了。',
          date: t(3), directOrTel: '直', meetingType: '面談(対面)',
          nextDate: '', progress: '初期見込み', principal: 'principal' }],
      }],
      [2, {
        description: '相続登記が未了の可能性あり。法定相続人の調査から着手',
        visits: [{ id: uuid(), user: '佐藤', comment: '現地訪問するも空き家。近隣ヒアリングでは所有者は数年前に死去、相続人は遠方在住とのこと。',
          date: t(2), directOrTel: '直', meetingType: '面談(対面)',
          nextDate: t(-3), progress: 'C', principal: 'other' }],
      }],
    ]);

    return [
      shinTokyoRyokan,
      buildProject('2', '13106-0105-142', {
        name: '根岸三丁目計画',
        description: '区画整理済みの整形地22筆を一体で取得し、共同住宅用地として開発する大型案件',
        address: '東京都台東区根岸3丁目',
        access: 'JR山手線「鶯谷」駅 徒歩5分',
        currentFar: 400,
        targetFar: 480,
      }, negishiOverrides),
      buildProject('3', '13106-0105-143', {
        name: '上野三丁目計画',
        description: '御徒町駅至近の商業地。中規模オフィスビル建設用地として8筆を取りまとめ',
        address: '東京都台東区上野3丁目',
        access: 'JR山手線「御徒町」駅 徒歩3分 / 東京メトロ銀座線「上野広小路」駅 徒歩4分',
        currentFar: 600,
        targetFar: 700,
      }, uenoOverrides),
      buildProject('4', '13106-0105-141', {
        name: '秋葉原計画',
        description: '秋葉原駅近接の4筆。隣接地権者の意向確認を開始した初期段階の案件',
        address: '東京都台東区秋葉原',
        access: 'JR山手線「秋葉原」駅 徒歩4分',
        currentFar: 600,
        targetFar: 600,
      }),
      buildProject('5', '13106-0105-140', {
        name: '上野三丁目第二計画',
        description: '上野三丁目計画の隣接街区18筆。第一計画の進捗を見ながら順次接触予定',
        address: '東京都台東区上野3丁目',
        access: 'JR山手線「御徒町」駅 徒歩4分',
        currentFar: 600,
        targetFar: 650,
      }),
    ];
  }

  const DataStore = {
    STATUS_DEFS: {
      target:   { label: '対象',   color: '#94a3b8', cls: 'status-target' },
      acquired: { label: '取得済', color: '#10b981', cls: 'status-acquired' },
    },

    uuid,
    nowIso,
    polygonAreaTsubo,
    parcelById,
    parcelAreas,

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

    // 永続化済みの案件を返す。なければサンプルを生成して保存。
    // バージョン不一致の旧データ（v1/v2）は破棄してサンプルを再生成する。
    load() {
      const data = loadRaw();
      if (data && Array.isArray(data.projects)) {
        const validKeys = new Set(['target', 'acquired']);
        let migrated = false;
        data.projects.forEach((p) => {
          (p.lands || []).forEach((l) => {
            if (!validKeys.has(l.status)) {
              l.status = 'target';
              migrated = true;
            }
            // 町名・地番・領域は筆マスタが正。ロードのたびに parcelId から再導出して
            // 「マスタと食い違う土地」「領域のない土地」が存在しない状態を維持する。
            const f = parcelById(l.parcelId);
            if (f) Object.assign(l, derivedLandFields(f));
          });
        });
        if (migrated) saveRaw(data.projects);
        return data.projects;
      }
      const sample = makeSampleProjects();
      saveRaw(sample);
      return sample;
    },

    save(projects) {
      saveRaw(projects);
    },

    reset() {
      localStorage.removeItem(STORAGE_KEY);
    },

    // CRUD ヘルパー（管理画面で使用）
    createProject(projects, fields) {
      const now = fields.date || nowIso();
      // 案件 ID は連番（既存の最大値 + 1）。文字列で保持して URL クエリと整合させる。
      const nextId = String(
        projects.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1
      );
      const proj = {
        id: nextId,
        name: fields.name || '',
        description: fields.description || '',
        createdAt: now,
        updatedAt: now,
        polygon: fields.polygon || null,
        lands: [],
      };
      projects.push(proj);
      return proj;
    },

    updateProject(projects, projectId, fields) {
      const proj = projects.find((p) => p.id === projectId);
      if (!proj) return null;
      // 登録日（createdAt）は不変。更新日（updatedAt）は呼び出しごとに自動更新。
      Object.assign(proj, {
        name: fields.name ?? proj.name,
        description: fields.description ?? proj.description,
        polygon: fields.polygon ?? proj.polygon,
        address: fields.address ?? proj.address,
        access: fields.access ?? proj.access,
        currentFar: fields.currentFar ?? proj.currentFar,
        targetFar: fields.targetFar ?? proj.targetFar,
        // frontRoads は空配列 [] を有効値として許容するため undefined チェックを使う
        frontRoads: fields.frontRoads !== undefined ? fields.frontRoads : proj.frontRoads,
        updatedAt: nowIso(),
      });
      return proj;
    },

    deleteProject(projects, projectId) {
      const idx = projects.findIndex((p) => p.id === projectId);
      if (idx < 0) return false;
      projects.splice(idx, 1);
      return true;
    },

    // 土地の作成は筆マスタの parcelId 必須。マスタに存在しない筆は作成できないため、
    // 「領域のない土地」「一致する筆がない土地」は構造上発生しない。
    createLand(projects, projectId, fields) {
      const proj = projects.find((p) => p.id === projectId);
      if (!proj) return null;
      const f = parcelById(fields.parcelId);
      if (!f) return null;
      const derived = derivedLandFields(f);
      const now = fields.createdAt || nowIso();
      const land = {
        id: uuid(),
        parcelId: fields.parcelId,
        aza: derived.aza,
        chiban: derived.chiban,
        polygon: derived.polygon,
        owners: fields.owners || [],
        description: fields.description || '',
        // 坪数の初期値は筆の面積から自動計算（公簿値等はパネルで上書き可能）
        areaTsubo: fields.areaTsubo ?? polygonAreaTsubo(derived.polygon),
        status: fields.status || 'target',
        createdAt: now,
        updatedAt: now,
        visits: [],
      };
      proj.lands.push(land);
      return land;
    },

    updateLand(projects, projectId, landId, fields) {
      const proj = projects.find((p) => p.id === projectId);
      if (!proj) return null;
      const land = proj.lands.find((l) => l.id === landId);
      if (!land) return null;
      // 筆の付け替え: マスタに存在する parcelId のみ受け付け、町名・地番・領域・坪数を再導出する
      if (fields.parcelId && fields.parcelId !== land.parcelId) {
        const f = parcelById(fields.parcelId);
        if (f) {
          land.parcelId = fields.parcelId;
          Object.assign(land, derivedLandFields(f));
          land.areaTsubo = polygonAreaTsubo(land.polygon);
        }
      }
      // 登録日（createdAt）は不変。更新日（updatedAt）は呼び出しごとに自動更新。
      // 町名・地番・領域はマスタ導出のため直接更新は受け付けない。
      Object.assign(land, {
        owners: fields.owners ?? land.owners,
        description: fields.description ?? land.description,
        areaTsubo: fields.areaTsubo ?? land.areaTsubo,
        status: fields.status ?? land.status,
        createdAt: fields.createdAt ?? land.createdAt,
        updatedAt: nowIso(),
      });
      return land;
    },

    deleteLand(projects, projectId, landId) {
      const proj = projects.find((p) => p.id === projectId);
      if (!proj) return false;
      const idx = proj.lands.findIndex((l) => l.id === landId);
      if (idx < 0) return false;
      proj.lands.splice(idx, 1);
      return true;
    },

    addVisit(projects, projectId, landId, fields) {
      const proj = projects.find((p) => p.id === projectId);
      if (!proj) return null;
      const land = proj.lands.find((l) => l.id === landId);
      if (!land) return null;
      const visit = {
        id: uuid(),
        user: fields.user,
        comment: fields.comment || '',
        date: fields.date || nowIso(),
        // ----- 業務報告シート 由来の任意フィールド -----
        directOrTel: fields.directOrTel || '', // 接触手段（「直」or「TEL」の2値）
        meetingType: fields.meetingType || '', // 面談区分（「面談(対面)」or「面談(ITP)」）
        nextDate: fields.nextDate || '',     // 次回予定日時（ISO 文字列。未設定なら ''）
        progress: fields.progress || '',     // 進捗状況（「B」or「初期見込み」）
        // 主権者区分: 商談相手の立場を3値で表す。
        //   'principal'     = 主権者（地権者本人 / 代表者）
        //   'non_principal' = 非主権者（家族・関係者経由）
        //   'other'         = その他（上記いずれにも当てはまらない）
        // 未指定なら 'principal' とする。
        principal: fields.principal || 'principal',
      };
      land.visits.push(visit);
      // 訪問追加も土地の活動なので、土地の更新日を進める
      land.updatedAt = nowIso();
      return visit;
    },
  };

  global.DataStore = DataStore;
})(window);
