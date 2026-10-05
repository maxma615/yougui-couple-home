"use client";

import Link from "next/link";
import { Repeat2 } from "lucide-react";

import type { Anniversary, ItemList } from "@/components/home-types";
import { AddLink, EmptyState, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { daysTogether, nextOccurrence, shanghaiToday } from "@/lib/local-date";

import "@/components/life-pages.css";

function timing(item: Anniversary, today: string) {
  if (item.yearly) {
    const next = nextOccurrence(item.date, today);
    const count = daysTogether(today, next) - 1;
    return { date: next, delta: count, text: count === 0 ? "就是今天" : `还有 ${count} 天` };
  }
  const count = daysTogether(item.date, today) - 1;
  if (count === 0) return { date: item.date, delta: 0, text: "就是今天" };
  return count > 0
    ? { date: item.date, delta: -count, text: `已过去 ${count} 天` }
    : { date: item.date, delta: Math.abs(count), text: `还有 ${Math.abs(count)} 天` };
}

export default function AnniversariesPage() {
  const resource = useResource<ItemList<Anniversary>>("/api/anniversaries");
  const today = shanghaiToday();

  return (
    <>
      <PageHeader eyebrow="值得记住的日子" title="纪念日" description="按日历日期记录，不会因浏览器时区改变。" action={<AddLink href="/anniversaries/new">新增纪念日</AddLink>} />
      {resource.error && resource.data ? <StatusMessage tone="error">同步失败：{resource.error}。继续显示上一次读取的内容。</StatusMessage> : null}
      {resource.loading && !resource.data ? <LoadingState /> : !resource.data ? <ErrorState message={resource.error || "暂时无法读取纪念日"} onRetry={() => void resource.refresh()} /> : !resource.data.items.length ? (
        <EmptyState title="从第一个重要日子开始" description="生日、相遇、周年，写下你们想一起记住的日期。" href="/anniversaries/new" action="新增纪念日" />
      ) : (
        <ol className="life-anniversary-list" aria-label="按日期排列的纪念日">
          {resource.data.items
            .map((item) => ({ item, info: timing(item, today) }))
            .sort((a, b) => {
              const aUpcoming = a.info.delta >= 0;
              const bUpcoming = b.info.delta >= 0;
              if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
              return aUpcoming ? a.info.delta - b.info.delta : b.info.delta - a.info.delta;
            })
            .map(({ item, info }, index) => index === 0 ? (
              <li className="life-anniversary-feature" key={item.id}>
                <Link href={`/anniversaries/${item.id}`}>
                  <div className="life-anniversary-feature__top">
                    <span className="life-anniversary-index">{info.delta < 0 ? "IN OUR STORY" : "NEXT"} · {item.yearly ? "YEARLY" : "ONE DAY"}</span>
                    <span className="life-anniversary-feature__repeat">{item.yearly ? <><Repeat2 size={14} /> 每年</> : "只此一次"}</span>
                  </div>
                  <div className="life-anniversary-feature__main">
                    <div className="life-anniversary-feature__copy">
                      <h2>{item.title}</h2>
                      {item.note ? <p>{item.note}</p> : null}
                    </div>
                    <time className="life-anniversary-date" dateTime={info.date}>
                      <span>{Number(info.date.slice(5, 7))}月</span>
                      <strong>{info.date.slice(8, 10)}</strong>
                      <small>{info.date.slice(0, 4)}</small>
                    </time>
                  </div>
                  <div className="life-anniversary-countdown">
                    {info.delta === 0 ? <><strong>今天</strong><span>一起庆祝</span></> : <>
                      <span>{info.delta < 0 ? "走过" : "还有"}</span>
                      <strong>{Math.abs(info.delta)}</strong>
                      <span>天</span>
                    </>}
                  </div>
                </Link>
              </li>
            ) : (
              <li className="life-anniversary-row" key={item.id}>
                <Link href={`/anniversaries/${item.id}`}>
                  <time dateTime={info.date}><span>{info.date.slice(5, 7)}月</span><strong>{info.date.slice(8, 10)}</strong></time>
                  <span className="life-anniversary-row__copy">
                    <strong>{item.title}</strong>
                    <small>{item.yearly ? <><Repeat2 size={13} /> 每年</> : info.date.slice(0, 4)}</small>
                  </span>
                  <span className="life-anniversary-row__timing">{info.text}</span>
                </Link>
              </li>
            ))}
        </ol>
      )}
    </>
  );
}
