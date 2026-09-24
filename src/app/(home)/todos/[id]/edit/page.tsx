"use client";

import { useParams } from "next/navigation";

import type { Todo } from "@/components/home-types";
import { TodoEditor } from "@/components/resource-forms";
import { ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";

export default function EditTodoPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const resource = useResource<Todo>(`/api/todos/${encodeURIComponent(id)}`);
  if (resource.loading && !resource.data) return <LoadingState />;
  if (!resource.data || !session?.home) return <ErrorState message={resource.error || "没有找到这条待办"} onRetry={() => void resource.refresh()} />;
  return (
    <>
      {resource.error ? <StatusMessage tone="error">同步失败：{resource.error}。你的输入仍然保留。</StatusMessage> : null}
      <PageHeader eyebrow="更新共同计划" title={`编辑 ${resource.data.title}`} backHref={`/todos/${resource.data.id}`} />
      <TodoEditor initial={resource.data} members={session.home.members} />
    </>
  );
}
