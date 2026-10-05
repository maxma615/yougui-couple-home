"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CalendarDays, Clock3, MapPin, Pencil } from "lucide-react";

import { apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { calendarRangeLabel } from "@/components/calendar-format";
import { DeleteConfirmButton } from "@/components/delete-confirm";
import { AuditLine, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";
import type { CalendarEventDto } from "@/modules/calendar/schema";

import "@/components/life-pages.css";

export default function CalendarEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const resource = useResource<CalendarEventDto>(`/api/calendar/${encodeURIComponent(id)}`);
  const item = resource.data;

  async function remove() {
    if (!item) return;
    try {
      await apiRequest<{ ok: true }>(`/api/calendar/${item.id}`, { method: "DELETE", body: jsonBody({ version: item.version }) });
      router.replace("/calendar");
    } catch (requestError) {
      void resource.refresh();
      throw new Error(errorMessage(requestError));
    }
  }

  if (resource.loading && !item) return <LoadingState />;
  if (!item) return <ErrorState message={resource.error || "没有找到这个日程"} onRetry={() => void resource.refresh()} />;
  return (
    <>
      {resource.error ? <StatusMessage tone="error">同步失败：{resource.error}。继续显示上一次读取的内容。</StatusMessage> : null}
      <PageHeader title={item.title} backHref="/calendar" action={<Link className="button" href={`/calendar/${item.id}/edit`}><Pencil size={17} /> 编辑</Link>} />
      <article className="detail-card life-detail-card life-calendar-detail">
        <div className="detail-heading">
          <div><p className="eyebrow">{item.allDay ? "全天事项" : "带时刻事项"}</p><h2>{calendarRangeLabel(item)}</h2></div>
          <CalendarDays size={30} />
        </div>
        <div className="chip-row">
          <span className="meta-chip"><Clock3 size={13} /> {item.allDay ? "全天" : "北京时间"}</span>
          {item.location ? <span className="meta-chip"><MapPin size={13} /> {item.location}</span> : null}
        </div>
        <p className="detail-body">{item.description}</p>
        <AuditLine record={item} members={session?.home?.members} />
        <div className="button-row" style={{ marginTop: "1rem" }}>
          <Link className="button button--secondary" href={`/calendar/${item.id}/edit`}><Pencil size={17} /> 编辑</Link>
          <DeleteConfirmButton kind="日程" name={item.title} onConfirm={remove} />
        </div>
      </article>
    </>
  );
}
