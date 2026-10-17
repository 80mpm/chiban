// PATCH /api/users/:userId — ユーザーの部分更新
// {name?, role?, isActive?, password?}（password キーでパスワード再設定）
// 削除 API は持たない（停止 = isActive: false）。

import { withApi, jsonOk } from "@chiban/shared/lib/api-error";
import { readJsonBody } from "@chiban/shared/lib/request";
import { updateUser } from "@chiban/shared/lib/queries/users";
import { requireAppApiUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ userId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return withApi(async () => {
    await requireAppApiUser();
    const { userId } = await params;
    const body = await readJsonBody(req);
    return jsonOk(await updateUser(userId, body));
  });
}
