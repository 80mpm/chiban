"use client";

import dynamic from "next/dynamic";
import { Topbar } from "@chiban/shared/components/Topbar";
import type { User } from "@chiban/shared/lib/types";

// Leaflet は window 前提なので SSR 無効で読み込む（client component 内なので ssr:false 可）。
const KouzuMapViewer = dynamic(() => import("@/components/kouzu/KouzuMapViewer"), {
  ssr: false,
  loading: () => <div className="flex-1 bg-[#eef2f7]" />,
});

/** 登記所備付地図ビューアの client 部（page.tsx は認可のためのサーバラッパー）。 */
export function KouzuMapPageClient({ user }: { user: User }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Topbar screen="登記所備付地図ビューア" showReset={false} user={user} />
      <div className="flex min-h-0 flex-1">
        <KouzuMapViewer />
      </div>
    </div>
  );
}
