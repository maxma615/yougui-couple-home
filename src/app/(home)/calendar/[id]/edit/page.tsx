"use client";

import { useParams } from "next/navigation";

import { CalendarEditor } from "@/components/calendar-editor";
import { ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import type { CalendarEventDto } from "@/modules/calendar/schema";

export default function EditCalendarEventPage() {
  const { id } = useParams<{ id: string }>();
  const resource = useResource<CalendarEventDto>(`/api/calendar/${encodeURIComponent(id)}`);
  if (resource.loading && !resource.data) return <LoadingState />;
  if (!resource.data) return <ErrorState message={resource.error || "没有找到这个日程"} onRetry={() => void resource.refresh()} />;
  return (
    <>
      {resource.error ? <StatusMessage tone="error">同步失败：{resource.error}。你的输入仍然保留。</StatusMessage> : null}
      <PageHeader eyebrow="调整共同安排" title={`编辑 ${resource.data.title}`} backHref={`/calendar/${resource.data.id}`} />
      <CalendarEditor initial={resource.data} />
    </>
  );
}
