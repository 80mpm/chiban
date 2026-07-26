import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { UserForm } from "@/components/user/UserForm";
import { listUsers } from "@chiban/shared/lib/queries/users";

export const dynamic = "force-dynamic";

/** ユーザー編集フォーム（氏名・種別・停止/再開）。 */
export default async function UserEditPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const users = await listUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) notFound();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar appName="案件入力システム" screen="ユーザーの編集" showReset={false} />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <UserForm user={user} />
      </div>
    </div>
  );
}
