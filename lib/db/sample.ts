// ============================================================
// サンプルデータ（db.py の _sample_projects / _insert_samples /
// reset_samples の移植）。登記所備付地図データの実筆から案件・土地を組み立てる。
// 投入はサーバ初回起動時と POST /api/reset 時のみ。
// ============================================================

import type { Sql, TransactionSql } from "postgres";
import { sql } from "./client";
import { uuid } from "./ids";
import { parcelRing, polygonAreaTsubo, convexHull, type GeoJsonPolygon } from "../geo";
import { replaceOwners } from "../queries/owners";
import type { LatLng, Owner, LandStatus } from "../types";

type SqlLike = Sql | TransactionSql;

const OWNER_POOL = [
  "佐藤誠一", "鈴木美津子", "高橋豊", "田中靖子", "伊藤博", "渡辺久美子",
  "山本健二", "中村文夫", "小林千代", "加藤正義", "吉田春子", "山田隆",
  "佐々木幸雄", "山口和子", "松本守", "井上静江", "木村洋一", "林芳子",
  "斎藤勝", "清水トミ", "森田一郎", "池田梅子",
];

// サンプル案件が使う筆の地番リスト（町名 + 地番で筆を一意に引く）
const NEGISHI_CHIBANS = [
  "16-5", "16-6", "24-8", "24-9", "31-11", "31-12", "31-13", "31-14",
  "31-15", "31-16", "31-17", "31-18", "31-19", "31-20", "16-12", "16-11",
  "16-10", "16-9", "16-7", "16-8", "86-7", "31-10",
];
const UENO_CHIBANS = ["141-1", "141-2", "141-7", "141-6", "141-5", "141-4", "141-3", "142"];
const AKIHABARA_CHIBANS = ["101", "102", "103", "100"];
const UENO_DAINI_CHIBANS = [
  "23-1", "23-2", "134-1", "134-2", "138-1", "138-2", "139", "140-1",
  "140-2", "140-5", "140-8", "140-4", "140-6", "140-7", "137-2", "137-3",
  "137-1", "137-4",
];

// 案件1（新東京旅館）の領域ポリゴン（実測由来の固定値）
const BASE_POLYGON: LatLng[] = [
  [35.712527309087434, 139.78921696543694],
  [35.71248974141639, 139.78941813111305],
  [35.71239064979333, 139.78940404951575],
  [35.712409978114074, 139.78932894766334],
  [35.71233810940472, 139.78930748999122],
  [35.712346820766875, 139.7892585396767],
  [35.71236424348836, 139.78926457464698],
  [35.712384932965136, 139.78917472064495],
];

const DAY_MS = 86_400_000;
/** now - days 日（負値で未来）。 */
function t(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}
/** t(days) の時刻を hour:minute:00 に揃える（ローカルタイム）。 */
function tAt(days: number, hour: number, minute = 0): Date {
  const d = t(days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

interface SampleVisit {
  user: string;
  comment: string;
  date: Date;
  directOrTel: string;
  meetingType: string;
  nextDate: Date | null;
  progress: string;
  principal: string;
}

function visit(
  user: string,
  comment: string,
  date: Date,
  directOrTel: string,
  meetingType: string,
  nextDate: Date | null,
  progress: string,
  principal: string,
): SampleVisit {
  return { user, comment, date, directOrTel, meetingType, nextDate, progress, principal };
}

interface SampleLand {
  parcelId: number;
  owners: Owner[];
  description: string;
  areaTsubo: number;
  status: LandStatus;
  createdAt: Date;
  updatedAt: Date;
  visits: SampleVisit[];
  _ring: LatLng[];
}

interface SampleProject {
  id: number;
  name?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  polygon: LatLng[] | null;
  address?: string;
  access?: string;
  currentFar?: number;
  targetFar?: number;
  frontRoads: { edgeIndex: number; width: number }[];
  lands: SampleLand[];
}

interface ParcelRow {
  id: number;
  geometry: GeoJsonPolygon;
}

/** サンプル案件 5 件を組み立てる（DB 挿入は insertSamples が行う）。 */
async function sampleProjects(db: SqlLike): Promise<SampleProject[]> {
  // 筆を「町名 + 地番」で引き、地番リストの並びを保って返す
  // （overrides がインデックス参照のため順序が重要）。
  async function parcelsByChibans(town: string, chibans: string[]): Promise<ParcelRow[]> {
    const rows = await db<(ParcelRow & { chiban: string })[]>`
      SELECT p.id, p.chiban, p.geometry FROM parcels p
        JOIN chibankuiki c ON c.id = p.chibankuiki_id
       WHERE c.name = ${town} AND p.chiban = ANY(${chibans})
    `;
    const byChiban = new Map(rows.map((r) => [r.chiban, r]));
    return chibans
      .map((cb) => byChiban.get(cb))
      .filter((r): r is ParcelRow & { chiban: string } => r !== undefined);
  }

  function landFromParcel(
    parcel: ParcelRow,
    idx: number,
    overrides: Partial<SampleLand> = {},
  ): SampleLand {
    const ring = parcelRing(parcel.geometry);
    return {
      parcelId: parcel.id,
      owners: [{ name: OWNER_POOL[idx % OWNER_POOL.length], share: "" }],
      description: "",
      areaTsubo: polygonAreaTsubo(ring),
      status: "target",
      createdAt: t(9),
      updatedAt: t(2),
      visits: [],
      _ring: ring,
      ...overrides,
    };
  }

  async function buildProject(
    pid: number,
    town: string,
    chibans: string[],
    meta: Partial<SampleProject>,
    overrides: Record<number, Partial<SampleLand>> = {},
  ): Promise<SampleProject> {
    const feats = await parcelsByChibans(town, chibans);
    const lands = feats.map((f, i) => landFromParcel(f, i, overrides[i] ?? {}));
    const allPts: LatLng[] = lands.flatMap((l) => l._ring);
    return {
      id: pid,
      createdAt: t(10),
      updatedAt: t(1),
      polygon: allPts.length >= 3 ? convexHull(allPts) : null,
      frontRoads: [],
      lands,
      ...meta,
    };
  }

  async function nishiAsakusaLand(
    chiban: string,
    overrides: Partial<SampleLand> = {},
  ): Promise<SampleLand | null> {
    const [parcel] = await db<ParcelRow[]>`
      SELECT p.id, p.geometry FROM parcels p
        JOIN chibankuiki c ON c.id = p.chibankuiki_id
       WHERE c.name = ${"西浅草二丁目"} AND p.chiban = ${chiban}
    `;
    if (!parcel) return null;
    return landFromParcel(parcel, 0, { owners: [], ...overrides });
  }

  // ----- 案件1: 新東京旅館（西浅草2-4-8・実筆4筆） -----
  const shinTokyoLands = (
    await Promise.all([
      nishiAsakusaLand("24-3", {
        owners: [{ name: "安野政子", share: "" }],
        description:
          "個人名義（安野氏）。世帯主と早期に条件合意し、所有権移転登記まで完了済み",
        status: "acquired",
        createdAt: t(8),
        updatedAt: t(3),
        visits: [
          visit("木村", "初回訪問。安野様にご挨拶し、再開発計画の概要を説明。本人は売却に前向き。", t(8), "直", "面談(対面)", t(5), "B", "principal"),
          visit("木村", "条件合意。売買契約締結・所有権移転登記完了。", t(3), "直", "面談(対面)", null, "初期見込み", "principal"),
        ],
      }),
      nishiAsakusaLand("23-1", {
        owners: [
          { name: "中嶋幸子", share: "1520/6755" },
          { name: "中嶋直美", share: "5235/6755" },
        ],
        description:
          "中嶋家2名の共有名義（持分比は不均等）。主たる持分を握る中嶋直美氏が窓口となり、所有権移転登記完了",
        status: "acquired",
        createdAt: t(6),
        updatedAt: t(6),
        visits: [
          visit("木村", "持分の多い中嶋直美氏が窓口となり、共有者全員から押印取得。所有権移転登記完了。", t(6), "直", "面談(対面)", null, "初期見込み", "principal"),
        ],
      }),
      nishiAsakusaLand("24-6", {
        owners: [{ name: "安野政子", share: "" }],
        description:
          "個人名義（安野氏）の小規模筆。隣地 24-3 と一体活用を前提に交渉、スムーズに取得完了",
        status: "acquired",
        createdAt: t(7),
        updatedAt: t(4),
        visits: [
          visit("本田", "24-3 取得を踏まえ、隣接小筆として安野様と再協議。条件合意・所有権移転登記完了。", t(4), "TEL", "面談(ITP)", null, "初期見込み", "principal"),
        ],
      }),
      nishiAsakusaLand("24-5", {
        owners: [{ name: "株式会社メイクス", share: "" }],
        description: "法人名義。代表と面談中、社内決裁を待っている段階",
        status: "target",
        createdAt: t(4),
        updatedAt: t(1),
        visits: [
          visit("本田", "初回訪問。代表に再開発の趣旨を説明、社内検討のため資料を持ち帰り。", t(4), "直", "面談(対面)", t(2), "初期見込み", "principal"),
          visit("木村", "代表より社内決裁待ちとの回答。次回は最終条件を提示予定。", t(1), "TEL", "面談(ITP)", tAt(-2, 15, 30), "B", "non_principal"),
        ],
      }),
    ])
  ).filter((l): l is SampleLand => l !== null);

  const shinTokyo: SampleProject = {
    id: 1,
    name: "新東京旅館",
    description: "駅東口・商業地のオフィスビル建設用地として、隣接する4筆をまとめて地上げ",
    createdAt: t(10),
    updatedAt: t(1),
    polygon: BASE_POLYGON,
    address: "東京都台東区西浅草2-4-8",
    access: "東京メトロ銀座線「田原町」駅 徒歩5分 / つくばエクスプレス「浅草」駅 徒歩5分",
    currentFar: 500,
    targetFar: 457,
    frontRoads: [
      { edgeIndex: 0, width: 6 },
      { edgeIndex: 1, width: 6 },
    ],
    lands: shinTokyoLands,
  };

  // ----- 案件2: 根岸三丁目計画（22筆） -----
  const negishiOverrides: Record<number, Partial<SampleLand>> = {
    0: {
      status: "acquired",
      updatedAt: t(5),
      visits: [
        visit("佐藤", "地権者と条件合意。売買契約締結・所有権移転登記完了。", t(5), "直", "面談(対面)", null, "初期見込み", "principal"),
      ],
    },
    5: { status: "acquired", updatedAt: t(5) },
    9: { status: "acquired", updatedAt: t(4) },
  };

  // ----- 案件3: 上野三丁目計画（8筆） -----
  const uenoOverrides: Record<number, Partial<SampleLand>> = {
    0: {
      status: "acquired",
      updatedAt: t(3),
      visits: [
        visit("佐藤", "地権者と条件合意。売買契約締結・所有権移転登記完了。", t(3), "直", "面談(対面)", null, "初期見込み", "principal"),
      ],
    },
    2: {
      description: "相続登記が未了の可能性あり。法定相続人の調査から着手",
      visits: [
        visit("佐藤", "現地訪問するも空き家。近隣ヒアリングでは所有者は数年前に死去、相続人は遠方在住とのこと。", t(2), "直", "面談(対面)", t(-3), "C", "other"),
      ],
    },
  };

  return [
    shinTokyo,
    await buildProject(2, "根岸三丁目", NEGISHI_CHIBANS, {
      name: "根岸三丁目計画",
      description: "区画整理済みの整形地22筆を一体で取得し、共同住宅用地として開発する大型案件",
      address: "東京都台東区根岸3丁目",
      access: "JR山手線「鶯谷」駅 徒歩5分",
      currentFar: 400,
      targetFar: 480,
    }, negishiOverrides),
    await buildProject(3, "上野三丁目", UENO_CHIBANS, {
      name: "上野三丁目計画",
      description: "御徒町駅至近の商業地。中規模オフィスビル建設用地として8筆を取りまとめ",
      address: "東京都台東区上野3丁目",
      access: "JR山手線「御徒町」駅 徒歩3分 / 東京メトロ銀座線「上野広小路」駅 徒歩4分",
      currentFar: 600,
      targetFar: 700,
    }, uenoOverrides),
    await buildProject(4, "秋葉原", AKIHABARA_CHIBANS, {
      name: "秋葉原計画",
      description: "秋葉原駅近接の4筆。隣接地権者の意向確認を開始した初期段階の案件",
      address: "東京都台東区秋葉原",
      access: "JR山手線「秋葉原」駅 徒歩4分",
      currentFar: 600,
      targetFar: 600,
    }),
    await buildProject(5, "上野三丁目", UENO_DAINI_CHIBANS, {
      name: "上野三丁目第二計画",
      description: "上野三丁目計画の隣接街区18筆。第一計画の進捗を見ながら順次接触予定",
      address: "東京都台東区上野3丁目",
      access: "JR山手線「御徒町」駅 徒歩4分",
      currentFar: 600,
      targetFar: 650,
    }),
  ];
}

/** サンプル案件を DB に投入する（明示 ID で挿入し IDENTITY シーケンスを進める）。 */
export async function insertSamples(db: SqlLike): Promise<void> {
  const projects = await sampleProjects(db);
  for (const proj of projects) {
    await db`
      INSERT INTO projects (id, name, description, polygon, address, access,
                            current_far, target_far, front_roads, created_at, updated_at)
      VALUES (
        ${proj.id}, ${proj.name ?? ""}, ${proj.description ?? ""},
        ${proj.polygon ? db.json(proj.polygon) : null},
        ${proj.address ?? null}, ${proj.access ?? null},
        ${proj.currentFar ?? null}, ${proj.targetFar ?? null},
        ${db.json(proj.frontRoads ?? [])}, ${proj.createdAt}, ${proj.updatedAt}
      )
    `;
    for (const land of proj.lands) {
      const landId = uuid();
      await db`
        INSERT INTO lands (id, project_id, parcel_id, description,
                           area_tsubo, status, created_at, updated_at)
        VALUES (${landId}, ${proj.id}, ${land.parcelId}, ${land.description},
                ${land.areaTsubo}, ${land.status}, ${land.createdAt}, ${land.updatedAt})
      `;
      await replaceOwners(db, landId, land.owners);
      for (const v of land.visits) {
        await db`
          INSERT INTO visits (id, land_id, user_name, comment, date,
                              direct_or_tel, meeting_type, next_date, progress, principal)
          VALUES (${uuid()}, ${landId}, ${v.user}, ${v.comment}, ${v.date},
                  ${v.directOrTel}, ${v.meetingType}, ${v.nextDate}, ${v.progress}, ${v.principal})
        `;
      }
    }
  }
  // 明示 ID で挿入したので IDENTITY シーケンスを進めておく
  await db`
    SELECT setval(pg_get_serial_sequence('projects', 'id'),
                  (SELECT COALESCE(MAX(id), 1) FROM projects))
  `;
}

/** 案件・土地・訪問記録を破棄してサンプルを再投入する（筆マスタは残す）。 */
export async function resetSamples(): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`TRUNCATE visits, land_owners, lands, projects RESTART IDENTITY CASCADE`;
    await insertSamples(tx);
    await tx`
      INSERT INTO app_meta (key, value) VALUES ('seeded', '1')
      ON CONFLICT (key) DO UPDATE SET value = '1'
    `;
  });
}
