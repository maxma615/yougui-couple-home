"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, Check, Circle, UserRound } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import type { ItemList, Todo } from "@/components/home-types";
import { AddLink, EmptyState, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";

type Filter = "open" | "done" | "all";

export default function TodosPage() {
  const { session } = useSession();
  const resource = useResource<ItemList<Todo>>("/api/todos");
  const [filter, setFilter] = useState<Filter>("open");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const items = useMemo(() => {
    const all = resource.data?.items || [];
    if (filter === "open") return all.filter((item) => !item.completed);
    if (filter === "done") return all.filter((item) => item.completed);
    return all;
  }, [resource.data, filter]);

  function assignee(todo: Todo) {
    return todo.assigneeId
      ? session?.home?.members.find((member) => member.id === todo.assigneeId)?.displayName || "指定成员"
      : "双方";
  }

  async function toggle(todo: Todo) {
    setBusyId(todo.id);
    setActionError(null);
    try {
      const updated = await apiRequest<Todo>(`/api/todos/${todo.id}`, {
        method: "PATCH",
        body: jsonBody({
          title: todo.title,
          description: todo.description,
          assigneeId: todo.assigneeId,
          dueDate: todo.dueDate,
          completed: !todo.completed,
          version: todo.version,
        }),
      });
      resource.setData({ items: (resource.data?.items || []).map((item) => item.id === updated.id ? updated : item) });
    } catch (requestError) {
      setActionError(requestError instanceof ApiError && requestError.status === 409
        ? "另一位成员刚刚修改了这条待办，已为你载入最新内容，请确认后再操作。"
        : errorMessage(requestError));
      await resource.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader eyebrow="一起完成的小事" title="共同待办" description="负责人可以是其中一人，也可以是双方一起。" action={<AddLink href="/todos/new">新增待办</AddLink>} />
      <div className="filter-row" role="group" aria-label="筛选待办">
        {([ ["open", "未完成"], ["done", "已完成"], ["all", "全部"] ] as const).map(([value, label]) => (
          <button key={value} className={filter === value ? "segmented-button is-active" : "segmented-button"} type="button" onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      {actionError ? <div style={{ marginBottom: "1rem" }}><ErrorState message={actionError} /></div> : null}
      {resource.error && resource.data ? <StatusMessage tone="error">同步失败：{resource.error}。继续显示上一次读取的内容。</StatusMessage> : null}
      {resource.loading && !resource.data ? <LoadingState /> : !resource.data ? <ErrorState message={resource.error || "暂时无法读取待办"} onRetry={() => void resource.refresh()} /> : !resource.data.items.length ? (
        <EmptyState title="现在没有共同待办" description="写下下一件想一起完成、采购或准备的事情。" href="/todos/new" action="新增待办" />
      ) : !items.length ? (
        <section className="empty-card"><Check size={28} /><h2>这个分类暂时为空</h2><p>切换分类看看其他待办。</p></section>
      ) : (
        <div className="list-stack">
          {items.map((todo) => (
            <article className={todo.completed ? "list-card list-card--completed" : "list-card"} key={todo.id}>
              <div className="list-card__top">
                <Link href={`/todos/${todo.id}`} style={{ color: "inherit", textDecoration: "none", minWidth: 0 }}><h2>{todo.title}</h2></Link>
                <button className="icon-button" style={{ background: "transparent", color: "var(--home-accent)", padding: ".35rem" }} type="button" disabled={busyId === todo.id} aria-label={todo.completed ? `恢复待办：${todo.title}` : `完成待办：${todo.title}`} onClick={() => void toggle(todo)}>
                  {todo.completed ? <Check size={23} /> : <Circle size={23} />}
                </button>
              </div>
              {todo.description ? <p className="card-copy">{todo.description}</p> : null}
              <div className="meta-row">
                <span className={todo.completed ? "status-chip status-chip--done" : "status-chip status-chip--open"}>{todo.completed ? "已完成" : "未完成"}</span>
                <span className="meta-chip"><UserRound size={13} /> {assignee(todo)}</span>
                {todo.dueDate ? <span className="meta-chip"><CalendarClock size={13} /> {todo.dueDate}</span> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
