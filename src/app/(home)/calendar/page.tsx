"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock3, MapPin } from "lucide-react";
import { useState } from "react";

import { compactCalendarLabel } from "@/components/calendar-format";
import type { ItemList } from "@/components/home-types";
import { AddLink, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { shanghaiToday } from "@/lib/local-date";
import { eventsForDate } from "@/modules/calendar/queries";
import type { CalendarEventDto } from "@/modules/calendar/schema";
import { MAX_CALENDAR_DATE, MAX_CALENDAR_YEAR, MIN_CALENDAR_DATE, MIN_CALENDAR_YEAR, monthGrid } from "@/modules/calendar/time";

const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export default function CalendarPage() {
  const today = shanghaiToday();
  const [initialYear, initialMonth] = today.split("-").map(Number);
  const [view, setView] = useState({ year: initialYear, month: initialMonth });
  const [selected, setSelected] = useState<string>(today);
  const resource = useResource<ItemList<CalendarEventDto>>("/api/calendar");

  function moveMonth(offset: number) {
    let year = view.year;
    let month = view.month + offset;
    if (month === 0) { year -= 1; month = 12; }
    if (month === 13) { year += 1; month = 1; }
    if (year < MIN_CALENDAR_YEAR || year > MAX_CALENDAR_YEAR) return;
    setView({ year, month });
    setSelected(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`);
  }

  if (resource.loading && !resource.data) return <LoadingState label="正在翻开日历…" />;
  if (!resource.data) return <ErrorState message={resource.error || "暂时无法读取日历"} onRetry={() => void resource.refresh()} />;

  const items = resource.data.items;
  const days = monthGrid(view.year, view.month);
  const selectedEvents = eventsForDate(items, selected);

  return (
    <>
      {resource.error ? <StatusMessage tone="error">同步失败：{resource.error}。继续显示上一次读取的日程。</StatusMessage> : null}
      <PageHeader eyebrow="把期待写进日子里" title="共同日历" description="全天和带时刻的安排，都按北京时间（Asia/Shanghai）一起查看。" action={<AddLink href="/calendar/new">新增日程</AddLink>} />
      <div className="calendar-layout">
        <section className="surface-card calendar-card" aria-label={`${view.year}年${view.month}月日历`}>
          <div className="calendar-toolbar">
            <button className="icon-button calendar-arrow" type="button" aria-label="上个月" disabled={view.year === MIN_CALENDAR_YEAR && view.month === 1} onClick={() => moveMonth(-1)}><ChevronLeft /></button>
            <h2>{view.year}年{view.month}月</h2>
            <button className="icon-button calendar-arrow" type="button" aria-label="下个月" disabled={view.year === MAX_CALENDAR_YEAR && view.month === 12} onClick={() => moveMonth(1)}><ChevronRight /></button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {weekdays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="calendar-grid">
            {days.map((day) => {
              const dayEvents = eventsForDate(items, day.date);
              const dayNumber = Number(day.date.slice(-2));
              const inRange = day.date >= MIN_CALENDAR_DATE && day.date <= MAX_CALENDAR_DATE;
              return (
                <button
                  key={day.date}
                  type="button"
                  data-date={day.date}
                  className={`calendar-day${day.inMonth ? "" : " is-outside"}${selected === day.date ? " is-selected" : ""}${today === day.date ? " is-today" : ""}`}
                  aria-label={`${day.date}${dayEvents.length ? `，${dayEvents.length}项安排` : "，无安排"}`}
                  aria-pressed={selected === day.date}
                  disabled={!inRange}
                  onClick={() => setSelected(day.date)}
                >
                  <span className="calendar-day__number">{dayNumber}</span>
                  <span className="calendar-day__events" aria-hidden="true">
                    {dayEvents.slice(0, 2).map((event) => <i key={event.id}>{event.allDay ? event.title : shanghaiTime(event.start)}</i>)}
                    {dayEvents.length > 2 ? <i>+{dayEvents.length - 2}</i> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="surface-card calendar-agenda" aria-labelledby="selected-day-title">
          <div className="section-title">
            <div><p className="eyebrow">选中的一天</p><h2 id="selected-day-title">{selected}</h2></div>
            <Link className="section-link" href={`/calendar/new?date=${selected}`}>添加</Link>
          </div>
          {selectedEvents.length ? (
            <div className="list-stack">
              {selectedEvents.map((event) => (
                <Link className="list-card calendar-event-card" href={`/calendar/${event.id}`} key={event.id}>
                  <h3>{event.title}</h3>
                  <p><Clock3 size={14} /> {compactCalendarLabel(event)}</p>
                  {event.location ? <p><MapPin size={14} /> {event.location}</p> : null}
                </Link>
              ))}
            </div>
          ) : <p className="muted-copy">这一天还没有安排</p>}
        </section>
      </div>
    </>
  );
}

function shanghaiTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
