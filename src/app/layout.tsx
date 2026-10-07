import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import "@/components/liquid-glass.css";

export const metadata: Metadata = {
  title: "有归 · 情侣空间",
  description: "只属于两个人的照片、日常与纪念",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
