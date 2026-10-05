"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CalendarDays, Pencil, Repeat2 } from "lucide-react";

import { apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { DeleteConfirmButton } from "@/components/delete-confirm";
import type { Anniversary } from "@/components/home-types";
import { AuditLine, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";
import { daysTogether, nextOccurrence, shanghaiToday } from "@/lib/local-date";

import "@/components/life-pages.css";

export default function AnniversaryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const resource = useResource<Anniversary>(`/api/anniversaries/${encodeURIComponent(id)}`);
  const item = resource.data;

  async function remove() {
    if (!item) return;
    try {
      await apiRequest<{ ok: true }>(`/api/anniversaries/${item.id}`, { method: "DELETE", body: jsonBody({ version: item.version }) });
      router.replace("/anniversaries");
    } catch (requestError) {
      void resource.refresh();
      throw new Error(errorMessage(requestError));
    }
  }

  if (resource.loading && !item) return <LoadingState />;
  if (!item) return <ErrorState message={resource.error || "没有找到这个纪念日"} onRetry={() => void resource.refresh()} />;
  const today = shanghaiToday();
  const next = item.yearly ? nextOccurrence(item.date, today) : item.date;
  const delta = daysTogether(today, next) - 1;

  return (
    <>
      {resource.error ? <StatusMessage tone="error">同步失败：{resource.error}。继续显示上一次读取的内容。</StatusMessage> : null}
      <PageHeader title={item.title} backHref="/anniversaries" action={<Link className="button" href={`/anniversaries/${item.id}/edit`}><Pencil size={17} /> 编辑</Link>} />
      <article className="detail-card life-detail-card anniversary-detail-card">
        <div className="detail-heading">
          <div className="anniversary-detail-copy"><p className="eyebrow">{item.yearly ? "每年纪念" : "单次纪念"}</p><h2>{item.yearly ? "下一个周年" : "纪念日期"}</h2></div>
          <time className="anniversary-detail-date" dateTime={item.date}>
            <span>{item.date.slice(5, 7)}月</span><strong>{item.date.slice(8, 10)}</strong><small>{item.date.slice(0, 4)}</small>
          </time>
        </div>
        <div className="chip-row anniversary-detail-meta">
          {item.yearly ? <span className="meta-chip"><Repeat2 size={13} /> 下一次 {next}</span> : null}
          <span className="meta-chip"><CalendarDays size={13} /> {delta === 0 ? "就是今天" : delta > 0 ? `还有 ${delta} 天` : `已过去 ${Math.abs(delta)} 天`}</span>
        </div>
        {item.yearly && item.date.endsWith("-02-29") ? <StatusMessage>2 月 29 日在非闰年按 2 月 28 日显示和倒数。</StatusMessage> : null}
        <p className="anniversary-detail-count" aria-label={delta === 0 ? "今天就是纪念日" : delta > 0 ? `还有 ${delta} 天` : `已过去 ${Math.abs(delta)} 天`}>
          <strong>{Math.abs(delta)}</strong><span>天</span>
        </p>
        {item.note ? <p className="detail-body">{item.note}</p> : null}
        <AuditLine record={item} members={session?.home?.members} />
        <div className="button-row" style={{ marginTop: "1rem" }}>
          <Link className="button button--secondary" href={`/anniversaries/${item.id}/edit`}><Pencil size={17} /> 编辑</Link>
          <DeleteConfirmButton kind="纪念日" name={item.title} onConfirm={remove} />
        </div>
      </article>
    </>
  );
}
