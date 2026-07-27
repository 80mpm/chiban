import { Topbar } from "@chiban/shared/components/Topbar";
import { UserListTable } from "@/components/user/UserListTable";
import { listUsers } from "@chiban/shared/lib/queries/users";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** ユーザー管理（一覧）。営業=閲覧システム / 事務=入力システムのアカウントを管理する。 */
export default async function UsersPage() {
  const user = await requireAppUser("/users");
  const users = await listUsers();
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="ユーザー管理" showReset={false} />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <UserListTable initialUsers={users} />
      </div>
    </div>
  );
}
