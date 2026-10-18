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
      <body>
        {children}
        <footer style={{ padding: "12px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
            浙ICP备2026086028号-1
          </a>
        </footer>
      </body>
    </html>
  );
}
