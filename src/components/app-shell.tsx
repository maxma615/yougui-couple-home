"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { CalendarHeart, CalendarRange, CheckSquare2, Home, LogOut, Settings, Sparkles } from "lucide-react";

import { apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { ConnectionStatus } from "@/components/connection-status";
import { BrandMark, ErrorState, LoadingState, StatusMessage } from "@/components/ui";
import { useHomeUpdates } from "@/hooks/use-home-updates";
import { SessionProvider, useSession } from "@/hooks/use-session";

import "./home.css";

const navigation = [
  { href: "/home", label: "首页", icon: Home },
  { href: "/calendar", label: "日历", icon: CalendarRange },
  { href: "/anniversaries", label: "纪念日", icon: CalendarHeart },
  { href: "/todos", label: "待办", icon: CheckSquare2 },
  { href: "/moments", label: "点滴", icon: Sparkles },
  { href: "/settings", label: "设置", icon: Settings },
];

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="public-shell">
      <div className="public-shell__glow public-shell__glow--one" />
      <div className="public-shell__glow public-shell__glow--two" />
      <div className="public-brand">
        <BrandMark />
        <span>有归</span>
      </div>
      {children}
    </main>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AppShellContent>{children}</AppShellContent>
    </SessionProvider>
  );
}

function AppShellContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, loading, error, refreshSession } = useSession();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const updates = useHomeUpdates({
    refresh: async () => {
      window.dispatchEvent(new Event("home-data-changed"));
      if (!(await refreshSession())) throw new Error("小屋资料同步失败");
    },
  });

  async function logout() {
    setLogoutError(null);
    try {
      await apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST", body: jsonBody({}) });
      router.replace("/login");
    } catch (requestError) {
      setLogoutError(errorMessage(requestError));
    }
  }

  if (loading && !session) return <main className="boot-shell"><LoadingState label="正在打开小屋…" /></main>;
  if (error && !session) return <main className="boot-shell"><ErrorState message={error} onRetry={() => void refreshSession()} /></main>;
  if (!session?.home) return null;

  return (
    <div className="app-shell">
      <aside className="side-rail">
        <Link className="side-brand" href="/home" aria-label="有归首页">
          <BrandMark />
          <span>
            <strong>{session.home.name}</strong>
            <small>{session.home.members.map((member) => member.displayName).join(" 与 ")}</small>
          </span>
        </Link>
        <nav aria-label="主要导航">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} className={active ? "nav-link is-active" : "nav-link"} href={href} aria-current={active ? "page" : undefined}>
                <Icon size={20} /> <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="side-rail__foot">
          <ConnectionStatus state={updates.state} label={updates.label} />
          <button className="quiet-button" type="button" onClick={() => void logout()}>
            <LogOut size={17} /> 退出登录
          </button>
        </div>
      </aside>
      <main className="app-main">
        <div className="mobile-topbar">
          <Link href="/home" aria-label="有归首页"><BrandMark compact /></Link>
          <span className="mobile-topbar__title">
            <strong>{session.home.name}</strong>
            <ConnectionStatus state={updates.state} label={updates.label} />
          </span>
          <button className="mobile-topbar__logout" type="button" aria-label="退出登录" onClick={() => void logout()}><LogOut size={19} /></button>
        </div>
        <div className="page-container">{children}</div>
      </main>
      {logoutError || error ? <div className="shell-toast"><StatusMessage tone="error">{logoutError ? `退出失败：${logoutError}` : `暂时无法同步：${error}`}</StatusMessage></div> : null}
      <nav className="bottom-nav" aria-label="主要导航">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link key={href} className={active ? "bottom-nav__link is-active" : "bottom-nav__link"} href={href} aria-current={active ? "page" : undefined}>
              <Icon size={21} /> <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
