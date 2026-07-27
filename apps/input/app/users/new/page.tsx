import { Topbar } from "@chiban/shared/components/Topbar";
import { UserForm } from "@/components/user/UserForm";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** ユーザー登録フォーム。 */
export default async function UserNewPage() {
  const user = await requireAppUser("/users/new");
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="ユーザーを登録" showReset={false} />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <UserForm />
      </div>
    </div>
  );
}
