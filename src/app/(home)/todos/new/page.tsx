"use client";

import { TodoEditor } from "@/components/resource-forms";
import { PageHeader } from "@/components/ui";
import { useSession } from "@/hooks/use-session";

export default function NewTodoPage() {
  const { session } = useSession();
  if (!session?.home) return null;
  return (
    <>
      <PageHeader eyebrow="一起完成" title="新增待办" description="可以稍后修改负责人、截止日和完成状态。" backHref="/todos" />
      <TodoEditor members={session.home.members} />
    </>
  );
}

