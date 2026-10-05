"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { CalendarClock, Check, Circle, UserRound } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import type { ItemList, Todo } from "@/components/home-types";
import { AddLink, EmptyState, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";

import "@/components/life-pages.css";

type Filter = "open" | "done" | "all";

export default function TodosPage() {
  const { session } = useSession();
  const resource = useResource<ItemList<Todo>>("/api/todos");
  const [filter, setFilter] = useState<Filter>("open");
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const requestLocks = useRef(new Set<string>());
  const [optimisticCompletion, setOptimisticCompletion] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const items = useMemo(() => {
    const all = resource.data?.items || [];
    if (filter === "open") return all.filter((item) => !(optimisticCompletion[item.id] ?? item.completed));
    if (filter === "done") return all.filter((item) => optimisticCompletion[item.id] ?? item.completed);
    return all;
  }, [resource.data, filter, optimisticCompletion]);

  function assignee(todo: Todo) {
    return todo.assigneeId
      ? session?.home?.members.find((member) => member.id === todo.assigneeId)?.displayName || "指定成员"
      : "双方";
  }

  async function toggle(todo: Todo) {
    if (requestLocks.current.has(todo.id)) return;
    requestLocks.current.add(todo.id);
    setBusyIds((current) => new Set(current).add(todo.id));
    setOptimisticCompletion((current) => ({ ...current, [todo.id]: !todo.completed }));
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
      resource.setData((current) => current ? {
        ...current,
        items: current.items.map((item) => item.id === updated.id && item.version <= updated.version ? updated : item),
      } : current);
      setOptimisticCompletion((current) => {
        const next = { ...current };
        delete next[todo.id];
        return next;
      });
    } catch (requestError) {
      setOptimisticCompletion((current) => {
        const next = { ...current };
        delete next[todo.id];
        return next;
      });
      setActionError(requestError instanceof ApiError && requestError.status === 409
        ? "另一位成员刚刚修改了这条待办，已为你载入最新内容，请确认后再操作。"
        : errorMessage(requestError));
      await resource.refresh();
    } finally {
      requestLocks.current.delete(todo.id);
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(todo.id);
        return next;
      });
    }
  }

  return (
    <>
      <PageHeader eyebrow="一起完成的小事" title="共同待办" description="负责人可以是其中一人，也可以是双方一起。" action={<AddLink href="/todos/new">新增待办</AddLink>} />
      <div className="life-todo-filters" role="group" aria-label="筛选待办">
        {([ ["open", "未完成"], ["done", "已完成"], ["all", "全部"] ] as const).map(([value, label]) => (
          <button key={value} className={filter === value ? "life-todo-filter is-active" : "life-todo-filter"} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      {actionError ? <StatusMessage tone="error">{actionError}</StatusMessage> : null}
      {resource.error && resource.data ? <StatusMessage tone="error">同步失败：{resource.error}。继续显示上一次读取的内容。</StatusMessage> : null}
      {resource.loading && !resource.data ? <LoadingState /> : !resource.data ? <ErrorState message={resource.error || "暂时无法读取待办"} onRetry={() => void resource.refresh()} /> : !resource.data.items.length ? (
        <EmptyState title="现在没有共同待办" description="写下下一件想一起完成、采购或准备的事情。" href="/todos/new" action="新增待办" />
      ) : !items.length ? (
        <section className="life-todo-empty"><Check size={22} /><h2>这个分类暂时为空</h2><p>切换筛选，继续看看一起安排的事情。</p></section>
      ) : (
        <ul className="life-todo-list">
          {items.map((todo) => {
            const completed = optimisticCompletion[todo.id] ?? todo.completed;
            const busy = busyIds.has(todo.id);
            return (
              <li className={completed ? "life-todo-row is-completed" : "life-todo-row"} key={todo.id}>
                <article>
                  <button className="life-todo-check" type="button" disabled={busy} aria-label={completed ? `恢复待办：${todo.title}` : `完成待办：${todo.title}`} aria-pressed={completed} aria-busy={busy} onClick={() => void toggle(todo)}>
                    {completed ? <Check size={18} /> : <Circle size={21} />}
                  </button>
                  <Link className="life-todo-copy" href={`/todos/${todo.id}`}>
                    <span className="life-todo-copy__title">{todo.title}</span>
                    {todo.description ? <span className="life-todo-copy__description">{todo.description}</span> : null}
                  </Link>
                  <div className="life-todo-meta">
                    <span className={completed ? "life-todo-state is-completed" : "life-todo-state"}>{completed ? "已完成" : "未完成"}</span>
                    <span><UserRound size={14} /> {assignee(todo)}</span>
                    {todo.dueDate ? <time dateTime={todo.dueDate}><CalendarClock size={14} /> {todo.dueDate}</time> : null}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
