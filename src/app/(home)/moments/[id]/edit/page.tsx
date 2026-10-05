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
    <div className="space-editor">
      {resource.error ? <StatusMessage tone="error">同步失败：{resource.error}。你的输入仍然保留。</StatusMessage> : null}
      <PageHeader eyebrow="更新这段记忆" title={`编辑 ${resource.data.title}`} description="修改标题、日期与文字，继续整理这段记忆。" backHref={`/moments/${resource.data.id}`} />
      <div className="space-editor__steps" aria-label="正在编辑点滴文字">
        <div className="space-editor__step"><span className="space-editor__step-number">01 / EDIT</span><p>更新这篇点滴的标题、日期或正文。</p></div>
        <div className="space-editor__step"><span className="space-editor__step-number">02 / PHOTOS</span><p>保存后，可以继续查看和添加照片。</p></div>
      </div>
      <MomentEditor initial={resource.data} />
    </div>
  );
}
