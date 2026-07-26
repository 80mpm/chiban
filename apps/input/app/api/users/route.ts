// GET  /api/users — 全ユーザー（password_hash は含まない）
// POST /api/users — ユーザー登録 {loginId, name, role, password}

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { readJsonBody } from "@chiban/shared/lib/request";
import { listUsers, createUser } from "@chiban/shared/lib/queries/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withApi(async () => jsonOk(await listUsers()));
}

export async function POST(req: Request) {
  return withApi(async () => {
    const body = await readJsonBody(req);
    return jsonOk(await createUser(body), 201);
  });
}
