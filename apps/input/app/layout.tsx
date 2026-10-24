import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@chiban/shared/components/Providers";

export const metadata: Metadata = {
  title: "案件入力システム",
  description: "ファミリーコーポレーション社 事務スタッフ向け 案件入力システム",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
