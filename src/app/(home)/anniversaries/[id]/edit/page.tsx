"use client";

import { useParams } from "next/navigation";

import type { Anniversary } from "@/components/home-types";
import { AnniversaryEditor } from "@/components/resource-forms";
import { ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";

export default function EditAnniversaryPage() {
  const { id } = useParams<{ id: string }>();
  const resource = useResource<Anniversary>(`/api/anniversaries/${encodeURIComponent(id)}`);
  if (resource.loading && !resource.data) return <LoadingState />;
  if (!resource.data) return <ErrorState message={resource.error || "没有找到这个纪念日"} onRetry={() => void resource.refresh()} />;
  return (
    <>
      {resource.error ? <StatusMessage tone="error">同步失败：{resource.error}。你的输入仍然保留。</StatusMessage> : null}
      <PageHeader eyebrow="保留重要的细节" title={`编辑 ${resource.data.title}`} backHref={`/anniversaries/${resource.data.id}`} />
      <AnniversaryEditor initial={resource.data} />
    </>
  );
}
