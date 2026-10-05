"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUpRight, CalendarHeart, Camera, Check, Plus } from "lucide-react";
import { HomeMotionScene } from "@/components/home-motion-scene";
import { HomeDecodeLabel, HomeMotionFrame } from "@/components/home-motion";
import { photoUrl } from "@/components/photo-url";
import { compactCalendarLabel } from "@/components/calendar-format";
import type { Anniversary, ItemList, Moment, Todo } from "@/components/home-types";
import { ErrorState, LoadingState, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";
import { daysTogether, nextOccurrence, shanghaiToday } from "@/lib/local-date";
import { upcomingEvents } from "@/modules/calendar/queries";
import type { CalendarEventDto } from "@/modules/calendar/schema";
import "@/components/space-home.css";

export default function HomePage() {
  const { session } = useSession();
  const anniversaries = useResource<ItemList<Anniversary>>("/api/anniversaries");
  const todos = useResource<ItemList<Todo>>("/api/todos");
  const moments = useResource<ItemList<Moment>>("/api/moments");
  const calendar = useResource<ItemList<CalendarEventDto>>("/api/calendar");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const today = shanghaiToday();
  if (!session?.home) return null;
  const error = anniversaries.error || todos.error || moments.error || calendar.error;
  const missing = !anniversaries.data || !todos.data || !moments.data || !calendar.data;
  if (missing && (anniversaries.loading || todos.loading || moments.loading || calendar.loading)) return <LoadingState label="正在整理今天的空间…" />;
  if (missing) return <ErrorState message={error || "暂时无法读取首页"} onRetry={() => { void anniversaries.refresh(); void todos.refresh(); void moments.refresh(); void calendar.refresh(); }} />;
  const next = (anniversaries.data?.items || []).map(item => ({ item, next: item.yearly ? nextOccurrence(item.date, today) : item.date })).filter(item => item.next >= today).sort((a,b) => a.next.localeCompare(b.next))[0];
  const openTodos = (todos.data?.items || []).filter(item => !item.completed).sort((a,b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")).slice(0,3);
  const recent = (moments.data?.items || []).slice(0,3);
  const photographs = (moments.data?.items || []).filter(item => item.photos.length).slice(0,3);
  const cover = photographs.find(item => item.id === selectedId) || photographs[0];
  const upcoming = upcomingEvents(calendar.data?.items || [], new Date(), 3);
  const totalDays = Math.max(0, daysTogether(session.home.startDate, today));
  const solo = session.home.members.length < 2;

  return <>
    <section className="space-home" aria-label={`${session.home.name}主视觉`}>
      <HomeMotionScene />
      <HomeMotionFrame />
      <header className="space-home__top"><span>有归 <i>/</i> 情侣空间</span><span>{session.home.name}</span></header>
      <div className="space-home__copy">
        <p className="eyebrow"><HomeDecodeLabel text="A PLACE FOR THE TWO OF US" delay={360} /></p>
        <h1><span className="space-home__title-line"><span>在这里，</span></span><span className="space-home__title-line"><span><em>只属于我们。</em></span></span></h1>
        <p className="space-home__intro">让每一个普通的日子，<br/>都有值得留下的瞬间。</p>
        <div className="space-home__actions"><Link className="button" href="/moments/new"><Plus size={17}/><HomeDecodeLabel text="添加照片" delay={900} /></Link><Link className="space-home__text-link" href="/moments"><HomeDecodeLabel text="走进回忆" delay={960} /> <ArrowUpRight size={18}/></Link></div>
      </div>
      {cover ? <div className="space-home__photographs">
        {photographs.filter(item=>item.id!==cover.id).slice(0,2).map((item,index)=><button key={item.id} className={`space-home__floating space-home__floating--${index+1}`} onClick={()=>setSelectedId(item.id)} aria-label={`查看封面：${item.title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={photoUrl(item.photos[0].id, { variant: "thumbnail" })} alt="" loading="lazy" decoding="async"/><span>{item.date.replaceAll("-",".")}</span>
        </button>)}
        <Link href={`/moments/${cover.id}`} className="space-home__featured" aria-label={`打开回忆：${cover.title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={photoUrl(cover.photos[0].id, { variant: "preview" })} alt={cover.title} fetchPriority="high" decoding="async"/><span><small>OUR MEMORIES</small>{cover.title}<ArrowUpRight size={18}/></span>
        </Link>
      </div> : <Link className="space-home__first-photo" href="/moments/new"><Camera size={21}/><span>第一张照片，等你们来放。</span><ArrowUpRight size={17}/></Link>}
      <footer className="space-home__foot"><div><span className="space-home__day-label">相爱的第</span><strong>{totalDays.toLocaleString("zh-CN")}</strong><span>天</span><small>{session.home.members.map(member=>member.displayName).join(" 与 ")}<br/>SINCE {session.home.startDate.replaceAll("-",".")}</small></div><a href="#our-today" className="space-home__scroll" aria-label="查看今天"><span><HomeDecodeLabel text="向下，看看今天" delay={1060} /></span><ArrowDown size={18}/></a></footer>
    </section>
    <div className="space-dashboard" id="our-today">
      {error ? <StatusMessage tone="error">部分内容暂时无法同步，继续显示上一次读取的记录。</StatusMessage> : null}
      <div className="space-dashboard__heading"><div><p className="eyebrow">OUR EVERYDAY</p><h2>日子很长，我们慢慢来。</h2></div><Link href="/settings#pairing" className="space-pair-link"><span className="space-pair-link__dots"><i/><i/></span>{solo?"邀请另一半":"已配对"}<ArrowUpRight size={16}/></Link></div>
      <div className="space-today">
        <Link className="space-today__anniversary" href="/anniversaries" aria-label="纪念日"><span className="eyebrow"><CalendarHeart size={14}/> 下一个纪念日</span><h3>{next?next.item.title:"留一个值得期待的日子"}</h3><p>{next?next.next.replaceAll("-","."):"第一次相见、下一次旅行，都值得纪念。"}</p><div><strong>{next?Math.max(0,daysTogether(today,next.next)-1):"—"}</strong><span>{next?"天后":"等待记录"}</span><ArrowUpRight size={23}/></div></Link>
        <section className="space-today__agenda"><header><h3>下一场约定</h3><Link href="/calendar" aria-label="打开日历"><ArrowUpRight size={20}/></Link></header>{upcoming.length?upcoming.map(event=><Link key={event.id} href={`/calendar/${event.id}`} className="space-agenda-row"><span>{compactCalendarLabel(event)}</span><strong>{event.title}</strong><small>{event.location||"留一段只属于彼此的时间"}</small></Link>):<div className="space-agenda-empty"><span>MAKE TIME FOR US</span><p>找一天见面，<br/>把期待写进日历。</p><Link href="/calendar/new">安排一次约会 <Plus size={15}/></Link></div>}</section>
        <section className="space-today__tasks"><header><h3>一起完成的小事</h3><Link href="/todos" aria-label="查看全部待办"><ArrowUpRight size={20}/></Link></header>{openTodos.length?openTodos.map(item=><Link className="space-task-row" key={item.id} href={`/todos/${item.id}`}><span className="space-task-row__circle"><Check size={13}/></span><div><strong>{item.title}</strong><small>{item.dueDate?`截止 ${item.dueDate}`:"慢慢来，一起做"}</small></div><ArrowUpRight size={14}/></Link>):<div className="space-agenda-empty"><p>一起去做的小事，<br/>也会变成回忆。</p><Link href="/todos/new">写下第一件事 <Plus size={15}/></Link></div>}</section>
      </div>
      <section className="space-recent"><header><div><p className="eyebrow">COLLECTING MOMENTS</p><h2>最近，值得留下的。</h2></div><Link href="/moments">全部回忆 <ArrowUpRight size={16}/></Link></header>{recent.length?<div className="space-recent__grid">{recent.map((item,index)=><Link key={item.id} href={`/moments/${item.id}`} className={`space-recent__item${item.photos.length?"":" is-text"}`}>
        {item.photos.length?/* eslint-disable-next-line @next/next/no-img-element */<img src={photoUrl(item.photos[0].id, { variant: "thumbnail" })} alt="" loading="lazy" decoding="async"/>:<div className="space-recent__words"><span>NOTE {String(index+1).padStart(2,"0")}</span><p>{item.body||"一句想说的话，一个值得记住的日子。"}</p></div>}
        <div><small>{item.date.replaceAll("-",".")}</small><h3>{item.title}</h3><ArrowUpRight size={18}/></div></Link>)}</div>:<Link className="space-recent__empty" href="/moments/new"><Camera size={25}/><span>收好第一份回忆。<small>照片或文字，都可以。</small></span><Plus size={21}/></Link>}</section>
      <footer className="space-dashboard__foot"><span>有归 · 情侣空间</span><span>只对彼此开放。</span></footer>
    </div>
  </>;
}
