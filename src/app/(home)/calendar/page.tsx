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

import "@/components/life-pages.css";

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

  function showToday() {
    setView({ year: initialYear, month: initialMonth });
    setSelected(today);
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
      <div className="life-calendar-layout">
        <section className="life-calendar-panel" aria-label={`${view.year}年${view.month}月日历`}>
          <div className="life-calendar-toolbar">
            <button className="icon-button life-calendar-arrow" type="button" aria-label="上个月" disabled={view.year === MIN_CALENDAR_YEAR && view.month === 1} onClick={() => moveMonth(-1)}><ChevronLeft /></button>
            <div className="life-calendar-month">
              <p className="eyebrow">SHARED DAYS</p>
              <h2>{view.year}年{view.month}月</h2>
            </div>
            <button className="icon-button life-calendar-arrow" type="button" aria-label="下个月" disabled={view.year === MAX_CALENDAR_YEAR && view.month === 12} onClick={() => moveMonth(1)}><ChevronRight /></button>
            <button className="life-calendar-today" type="button" onClick={showToday}>回到今天</button>
          </div>
          <div className="life-calendar-weekdays" aria-hidden="true">
            {weekdays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="life-calendar-grid">
            {days.map((day) => {
              const dayEvents = eventsForDate(items, day.date);
              const dayNumber = Number(day.date.slice(-2));
              const inRange = day.date >= MIN_CALENDAR_DATE && day.date <= MAX_CALENDAR_DATE;
              return (
                <button
                  key={day.date}
                  type="button"
                  data-date={day.date}
                  className={`calendar-day life-calendar-day${day.inMonth ? "" : " is-outside"}${selected === day.date ? " is-selected" : ""}${today === day.date ? " is-today" : ""}`}
                  aria-label={`${day.date}${dayEvents.length ? `，${dayEvents.length}项安排：${dayEvents.map((event) => event.title).join("、")}` : "，无安排"}`}
                  aria-pressed={selected === day.date}
                  aria-current={today === day.date ? "date" : undefined}
                  data-has-events={dayEvents.length > 0 || undefined}
                  disabled={!inRange}
                  onClick={() => setSelected(day.date)}
                >
                  <span className="life-calendar-day__number">{dayNumber}</span>
                  <span className="life-calendar-day__markers" aria-hidden="true">
                    {dayEvents.slice(0, 3).map((event) => <i key={event.id} />)}
                  </span>
                  <span className="life-calendar-day__count" aria-hidden="true">{dayEvents.length ? `${dayEvents.length}项` : ""}</span>
                </button>
              );
            })}
          </div>
          <div className="life-calendar-key" aria-label="日历标记说明">
            <span><i className="life-calendar-key__today" /> 今天</span>
            <span><i className="life-calendar-key__event" /> 有安排</span>
          </div>
        </section>

        <section className="life-calendar-agenda" aria-labelledby="selected-day-title">
          <div className="life-calendar-agenda__heading">
            <div>
              <p className="eyebrow">所选日期</p>
              <h2 id="selected-day-title"><span>{selected.slice(5, 7)}月{Number(selected.slice(8, 10))}日</span><small>{selected.slice(0, 4)}</small></h2>
            </div>
            <Link className="life-calendar-add" href={`/calendar/new?date=${selected}`}>添加日程</Link>
          </div>
          {selectedEvents.length ? (
            <div className="life-calendar-events">
              {selectedEvents.map((event, index) => (
                <Link className="life-calendar-event" href={`/calendar/${event.id}`} key={event.id}>
                  <span className="life-calendar-event__index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="life-calendar-event__body">
                    <span className="life-calendar-event__time"><Clock3 size={14} /> {compactCalendarLabel(event)}</span>
                    <h3>{event.title}</h3>
                    {event.location ? <span className="life-calendar-event__location"><MapPin size={14} /> {event.location}</span> : null}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="life-calendar-empty">
              <span>{today === selected ? "TODAY, UNWRITTEN" : "A LITTLE SPACE"}</span>
              <p>这一天还没有安排</p>
              <small>把想一起去的地方，留在这里。</small>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
