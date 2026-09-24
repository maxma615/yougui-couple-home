"use client";

import Link from "next/link";
import { CalendarDays, CalendarRange, CheckCircle2, Heart, Sparkles } from "lucide-react";

import { compactCalendarLabel } from "@/components/calendar-format";
import type { Anniversary, ItemList, Moment, Todo } from "@/components/home-types";
import { ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";
import { daysTogether, nextOccurrence, shanghaiToday } from "@/lib/local-date";
import { upcomingEvents } from "@/modules/calendar/queries";
import type { CalendarEventDto } from "@/modules/calendar/schema";

function distance(from: string, to: string): number {
  return daysTogether(from, to) - 1;
}

function upcomingAnniversary(items: Anniversary[], today: string) {
  return items
    .map((item) => ({
      item,
      next: item.yearly ? nextOccurrence(item.date, today) : item.date,
    }))
    .filter(({ next }) => next >= today)
    .sort((a, b) => a.next.localeCompare(b.next))[0] || null;
}

export default function HomePage() {
  const { session } = useSession();
  const anniversaries = useResource<ItemList<Anniversary>>("/api/anniversaries");
  const todos = useResource<ItemList<Todo>>("/api/todos");
  const moments = useResource<ItemList<Moment>>("/api/moments");
  const calendar = useResource<ItemList<CalendarEventDto>>("/api/calendar");
  const today = shanghaiToday();

  if (!session?.home) return null;
  const error = anniversaries.error || todos.error || moments.error || calendar.error;
  const missingData = !anniversaries.data || !todos.data || !moments.data || !calendar.data;
  if (missingData && (anniversaries.loading || todos.loading || moments.loading || calendar.loading)) return <LoadingState label="正在整理今天的小屋…" />;
  if (missingData) return <ErrorState message={error || "暂时无法读取首页"} onRetry={() => { void anniversaries.refresh(); void todos.refresh(); void moments.refresh(); void calendar.refresh(); }} />;

  const next = upcomingAnniversary(anniversaries.data?.items || [], today);
  const openTodos = (todos.data?.items || [])
    .filter((item) => !item.completed)
    .sort((a, b) => (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31"))
    .slice(0, 4);
  const recentMoments = (moments.data?.items || []).slice(0, 3);
  const upcoming = upcomingEvents(calendar.data?.items || [], new Date(), 4);
  const totalDays = Math.max(0, daysTogether(session.home.startDate, today));

  return (
    <>
      {error ? <StatusMessage tone="error">部分内容暂时无法同步，页面继续显示上一次成功读取的内容。</StatusMessage> : null}
      <PageHeader eyebrow="今天也在一起" title={`你好，${session.user.displayName}`} description="这里是你们共同生活的最新一页。" />
      <section className="hero-card">
        <p className="eyebrow">{session.home.members.map((member) => member.displayName).join(" ♡ ")}</p>
        <h1>相爱的第 <span className="hero-card__days">{totalDays}</span> 天</h1>
        <p>从 {session.home.startDate} 开始，按北京时间计算。</p>
      </section>

      <div className="card-grid card-grid--summary">
        <article className="summary-card">
          <span className="summary-card__icon"><CalendarDays size={20} /></span>
          <strong>{next ? next.item.title : "还没有"}</strong>
          <small>{next ? `${next.next} · ${distance(today, next.next) === 0 ? "就是今天" : `还有 ${distance(today, next.next)} 天`}` : "添加一个值得期待的日子"}</small>
        </article>
        <article className="summary-card">
          <span className="summary-card__icon"><CalendarRange size={20} /></span>
          <strong>{upcoming.length ? upcoming[0].title : "暂无安排"}</strong>
          <small>{upcoming.length ? compactCalendarLabel(upcoming[0]) : "把下一次约会写进日历"}</small>
        </article>
        <article className="summary-card">
          <span className="summary-card__icon"><CheckCircle2 size={20} /></span>
          <strong>{openTodos.length} 件</strong>
          <small>还有这些小事，等我们一起完成</small>
        </article>
        <article className="summary-card">
          <span className="summary-card__icon"><Sparkles size={20} /></span>
          <strong>{recentMoments.length ? recentMoments[0].date : "等待记录"}</strong>
          <small>{recentMoments.length ? "最近一次共同点滴" : "把今天留在这里"}</small>
        </article>
      </div>

      <section className="surface-card" style={{ marginTop: "1rem" }}>
        <div className="section-title"><h2>近期日程</h2><Link className="section-link" href="/calendar">打开日历</Link></div>
        {upcoming.length ? (
          <div className="home-calendar-list">
            {upcoming.map((event) => (
              <Link className="list-card" key={event.id} href={`/calendar/${event.id}`}>
                <div className="list-card__top"><h3>{event.title}</h3><CalendarRange size={17} color="var(--home-accent)" /></div>
                <p>{compactCalendarLabel(event)}{event.location ? ` · ${event.location}` : ""}</p>
              </Link>
            ))}
          </div>
        ) : <p className="muted-copy">近期还没有安排，给彼此留一个值得期待的时间吧。</p>}
      </section>

      <div className="dashboard-grid" style={{ marginTop: "1rem" }}>
        <section className="surface-card">
          <div className="section-title"><h2>最近待办</h2><Link className="section-link" href="/todos">查看全部</Link></div>
          {openTodos.length ? (
            <div className="list-stack">
              {openTodos.map((todo) => (
                <Link className="list-card" key={todo.id} href={`/todos/${todo.id}`}>
                  <div className="list-card__top"><h3>{todo.title}</h3><span className="status-chip status-chip--open">未完成</span></div>
                  <p>{todo.dueDate ? `截止 ${todo.dueDate}` : "没有截止日期"}</p>
                </Link>
              ))}
            </div>
          ) : <p className="muted-copy">现在没有未完成待办，轻松享受今天吧。</p>}
        </section>
        <section className="surface-card">
          <div className="section-title"><h2>最近点滴</h2><Link className="section-link" href="/moments">打开时间线</Link></div>
          {recentMoments.length ? (
            <div className="list-stack">
              {recentMoments.map((moment) => (
                <Link className="list-card" key={moment.id} href={`/moments/${moment.id}`}>
                  <div className="list-card__top"><h3>{moment.title}</h3><Heart size={17} color="var(--home-accent)" /></div>
                  <p>{moment.date}{moment.photos.length ? ` · ${moment.photos.length} 张照片` : ""}</p>
                </Link>
              ))}
            </div>
          ) : <p className="muted-copy">还没有点滴记录，第一篇可以从今天开始。</p>}
        </section>
      </div>
    </>
  );
}
