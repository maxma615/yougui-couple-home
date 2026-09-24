"use client";

import Link from "next/link";
import { CalendarDays, Repeat2 } from "lucide-react";

import type { Anniversary, ItemList } from "@/components/home-types";
import { AddLink, EmptyState, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { daysTogether, nextOccurrence, shanghaiToday } from "@/lib/local-date";

function timing(item: Anniversary, today: string) {
  if (item.yearly) {
    const next = nextOccurrence(item.date, today);
    const count = daysTogether(today, next) - 1;
    return { date: next, text: count === 0 ? "就是今天" : `还有 ${count} 天` };
  }
  const count = daysTogether(item.date, today) - 1;
  if (count === 0) return { date: item.date, text: "就是今天" };
  return count > 0
    ? { date: item.date, text: `已过去 ${count} 天` }
    : { date: item.date, text: `还有 ${Math.abs(count)} 天` };
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
        <div className="list-stack">
          {resource.data.items.map((item) => {
            const info = timing(item, today);
            return (
              <Link className="list-card" key={item.id} href={`/anniversaries/${item.id}`}>
                <div className="list-card__top"><h2>{item.title}</h2><CalendarDays size={20} color="var(--home-accent)" /></div>
                {item.note ? <p className="card-copy">{item.note}</p> : null}
                <div className="meta-row">
                  <span className="meta-chip">{info.date}</span>
                  <span className="meta-chip">{info.text}</span>
                  {item.yearly ? <span className="meta-chip"><Repeat2 size={13} /> 每年</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
