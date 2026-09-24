"use client";

import { useParams } from "next/navigation";

import type { Moment } from "@/components/home-types";
import { MomentEditor } from "@/components/resource-forms";
import { ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";

export default function EditMomentPage() {
  const { id } = useParams<{ id: string }>();
  const resource = useResource<Moment>(`/api/moments/${encodeURIComponent(id)}`);
  if (resource.loading && !resource.data) return <LoadingState />;
  if (!resource.data) return <ErrorState message={resource.error || "没有找到这篇点滴"} onRetry={() => void resource.refresh()} />;
  return (
    <>
      {resource.error ? <StatusMessage tone="error">同步失败：{resource.error}。你的输入仍然保留。</StatusMessage> : null}
      <PageHeader eyebrow="更新这段记忆" title={`编辑 ${resource.data.title}`} backHref={`/moments/${resource.data.id}`} />
      <MomentEditor initial={resource.data} />
    </>
  );
}
