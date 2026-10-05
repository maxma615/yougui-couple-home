"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import { CalendarHeart, CalendarRange, Camera, CheckSquare2, Heart, Home, LogOut, Settings } from "lucide-react";

import { apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { ConnectionStatus } from "@/components/connection-status";
import { PageMotionScope } from "@/components/page-motion";
import { BrandMark, ErrorState, LoadingState, StatusMessage } from "@/components/ui";
import { useHomeUpdates } from "@/hooks/use-home-updates";
import { SessionProvider, useSession } from "@/hooks/use-session";

import "./home.css";
import "./public-experience.css";
import { SpaceScene } from "./space-scene";

const navigation = [
  { href: "/home", label: "首页", icon: Home },
  { href: "/calendar", label: "日历", icon: CalendarRange },
  { href: "/anniversaries", label: "纪念日", icon: CalendarHeart },
  { href: "/todos", label: "待办", icon: CheckSquare2 },
  { href: "/moments", label: "相册", icon: Camera },
  { href: "/settings", label: "我们", icon: Settings },
];

// 手机底部导航固定五项；纪念日从首页与「我们」进入，并让「我们」保持激活。
const mobileNavigation = [
  { href: "/home", label: "首页", icon: Home },
  { href: "/calendar", label: "日历", icon: CalendarRange },
  { href: "/todos", label: "待办", icon: CheckSquare2 },
  { href: "/moments", label: "相册", icon: Camera },
  { href: "/settings", label: "我们", icon: Heart },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <main className="public-shell">
      <SpaceScene className="public-scene" />
      <div className="public-intro"><p className="eyebrow">YOUGUI · COUPLE SPACE</p><h2>把日常，<br />留给我们。</h2><p>一个属于两个人的空间。<br />收好每一张照片，期待下一次相见。</p><span className="public-intro__note">PRIVATE BY NATURE · 只对彼此开放</span></div>
      <div className="public-brand">
        <BrandMark />
        <span>
          有归
          <small>情侣空间</small>
        </span>
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
      if (!(await refreshSession())) throw new Error("空间资料同步失败");
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

  if (loading && !session) return <main className="boot-shell"><LoadingState label="正在打开情侣空间…" /></main>;
  if (error && !session) return <main className="boot-shell"><ErrorState message={error} onRetry={() => void refreshSession()} /></main>;
  if (!session?.home) return null;

  const mobileActive = (href: string) =>
    href === "/settings" ? isActive(pathname, "/settings") || isActive(pathname, "/anniversaries") : isActive(pathname, href);
  const mobileIndex = mobileNavigation.findIndex(({ href }) => mobileActive(href));
  const railIndex = navigation.findIndex(({ href }) => isActive(pathname, href));

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="mobile-topbar">
          <Link href="/home" aria-label="有归首页"><BrandMark compact /></Link>
          <span className="mobile-topbar__title">
            <strong>{session.home.name}</strong>
            <ConnectionStatus state={updates.state} label={updates.label} />
          </span>
          <button className="mobile-topbar__logout" type="button" aria-label="退出登录" onClick={() => void logout()}><LogOut size={19} /></button>
        </div>
        <PageMotionScope pathname={pathname}>{children}</PageMotionScope>
      </main>
      <aside className="side-rail side-rail--motion">
        <Link className="side-brand" href="/home" aria-label="有归首页">
          <BrandMark />
          <span>
            <strong>有归<span className="side-brand__tag">情侣空间</span></strong>
            <small>{session.home.members.map((member) => member.displayName).join(" 与 ")}</small>
          </span>
        </Link>
        <p className="side-rail__caption">OUR LITTLE UNIVERSE</p>
        <nav aria-label="主要导航" data-nav-active={railIndex >= 0} style={{ "--nav-index": Math.max(0, railIndex) } as CSSProperties}>
          <span className="side-rail__glider" aria-hidden="true" />
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
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
      {logoutError || error ? <div className="shell-toast"><StatusMessage tone="error">{logoutError ? `退出失败：${logoutError}` : `暂时无法同步：${error}`}</StatusMessage></div> : null}
      <nav className="bottom-nav bottom-nav--motion" aria-label="主要导航" data-nav-active={mobileIndex >= 0} style={{ "--nav-index": Math.max(0, mobileIndex) } as CSSProperties}>
        <span className="bottom-nav__track" aria-hidden="true"><span className="bottom-nav__glider" /></span>
        {mobileNavigation.map(({ href, label, icon: Icon }) => {
          const active = mobileActive(href);
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
