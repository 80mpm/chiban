import { Topbar } from "@chiban/shared/components/Topbar";
import { ProjectForm } from "@/components/project/ProjectForm";
import { requireAppUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 新規案件の作成フォーム（案件名・概要のみ。詳細は作成後に編集ページで入力）。 */
export default async function ProjectNewPage() {
  const user = await requireAppUser("/projects/new");
  return (
    <div className="grid h-screen grid-rows-[56px_1fr]">
      <Topbar user={user} appName="案件入力システム" screen="新規案件" />
      <div className="min-h-0 overflow-y-auto bg-[color:var(--app-bg)]">
        <ProjectForm />
      </div>
    </div>
  );
}
