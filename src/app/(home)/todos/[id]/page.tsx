"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Circle, Pencil, Trash2, UserRound } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import type { Todo } from "@/components/home-types";
import { AuditLine, ErrorState, LoadingState, PageHeader, StatusMessage, confirmDelete, formatShanghaiTime } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";

export default function TodoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const resource = useResource<Todo>(`/api/todos/${encodeURIComponent(id)}`);
  const item = resource.data;

  function assignee(todo: Todo) {
    return todo.assigneeId
      ? session?.home?.members.find((member) => member.id === todo.assigneeId)?.displayName || "指定成员"
      : "双方一起";
  }

  async function toggle() {
    if (!item) return;
    try {
      const updated = await apiRequest<Todo>(`/api/todos/${item.id}`, {
        method: "PATCH",
        body: jsonBody({ title: item.title, description: item.description, assigneeId: item.assigneeId, dueDate: item.dueDate, completed: !item.completed, version: item.version }),
      });
      resource.setData(updated);
    } catch (requestError) {
      window.alert(requestError instanceof ApiError && requestError.status === 409 ? "另一位成员已修改这条待办。已载入最新内容，请确认后再操作。" : errorMessage(requestError));
      await resource.refresh();
    }
  }

  async function remove() {
    if (!item || !confirmDelete("待办", item.title)) return;
    try {
      await apiRequest<{ ok: true }>(`/api/todos/${item.id}`, { method: "DELETE", body: jsonBody({ version: item.version }) });
      router.replace("/todos");
    } catch (requestError) {
      window.alert(errorMessage(requestError));
      void resource.refresh();
    }
  }

  if (resource.loading && !item) return <LoadingState />;
  if (!item) return <ErrorState message={resource.error || "没有找到这条待办"} onRetry={() => void resource.refresh()} />;

  return (
    <>
      {resource.error ? <StatusMessage tone="error">同步失败：{resource.error}。继续显示上一次读取的内容。</StatusMessage> : null}
      <PageHeader title={item.title} backHref="/todos" action={<Link className="button" href={`/todos/${item.id}/edit`}><Pencil size={17} /> 编辑</Link>} />
      <article className="detail-card">
        <div className="detail-heading">
          <div><p className="eyebrow">{item.completed ? "已经完成" : "等待完成"}</p><h2>{item.title}</h2></div>
          {item.completed ? <CheckCircle2 size={31} color="var(--home-success)" /> : <Circle size={31} color="var(--home-accent)" />}
        </div>
        <div className="chip-row">
          <span className="meta-chip"><UserRound size={13} /> {assignee(item)}</span>
          {item.dueDate ? <span className="meta-chip"><CalendarClock size={13} /> 截止 {item.dueDate}</span> : null}
          {item.completedAt ? <span className="meta-chip">完成于 {formatShanghaiTime(item.completedAt)}</span> : null}
        </div>
        <p className="detail-body">{item.description}</p>
        <AuditLine record={item} members={session?.home?.members} />
        <div className="button-row" style={{ marginTop: "1rem" }}>
          <button className="button button--secondary" type="button" onClick={() => void toggle()}>{item.completed ? <Circle size={17} /> : <CheckCircle2 size={17} />}{item.completed ? "恢复未完成" : "标记完成"}</button>
          <button className="button button--danger" type="button" onClick={() => void remove()}><Trash2 size={17} /> 删除“{item.title}”</button>
        </div>
        {item.completed ? <div style={{ marginTop: "1rem" }}><StatusMessage tone="success">这件事已经完成，需要时可以恢复为未完成。</StatusMessage></div> : null}
      </article>
    </>
  );
}
