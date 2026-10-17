import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@chiban/shared/components/LoginForm";
import { getCurrentUser, APP_ROLES } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** ログイン画面（案件閲覧システム）。ログイン済みならトップへ。 */
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user && APP_ROLES.includes(user.role)) redirect("/");
  return (
    <Suspense>
      <LoginForm appName="案件管理システム" />
    </Suspense>
  );
}
