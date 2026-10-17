"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

/**
 * 全画面共通のクライアントプロバイダ。
 * - TanStack Query（案件ツリー・筆マスタの取得/更新キャッシュ）
 * - Sonner（旧 common.js の toast() の置き換え）
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 案件データはデモなので積極的に再取得しない。
            // CRUD 後は明示的に invalidate する。
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}
