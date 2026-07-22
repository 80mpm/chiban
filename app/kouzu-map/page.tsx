"use client";

import dynamic from "next/dynamic";
import { Topbar } from "@/components/Topbar";

// Leaflet は window 前提なので SSR 無効で読み込む（client component 内なので ssr:false 可）。
const KouzuMapViewer = dynamic(() => import("@/components/kouzu/KouzuMapViewer"), {
  ssr: false,
  loading: () => <div className="flex-1 bg-[#eef2f7]" />,
});

/** 登記所備付地図ビューア（独立デモ画面・DataStore 非依存）。 */
export default function KouzuMapPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Topbar screen="登記所備付地図ビューア" showReset={false} />
      <div className="flex min-h-0 flex-1">
        <KouzuMapViewer />
      </div>
    </div>
  );
}
