import { notFound } from "next/navigation";
import { Topbar } from "@chiban/shared/components/Topbar";
import { PasswordForm } from "@/components/user/PasswordForm";
import { listUsers } from "@chiban/shared/lib/queries/users";

export const dynamic = "force-dynamic";

/** パスワード再設定フォーム。 */
export default async function UserPasswordPage({
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
      <Topbar appName="案件入力システム" screen="パスワード再設定" showReset={false} />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <PasswordForm user={user} />
      </div>
    </div>
  );
}
