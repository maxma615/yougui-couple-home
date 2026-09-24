"use client";

import { useSearchParams } from "next/navigation";

import { CalendarEditor } from "@/components/calendar-editor";
import { PageHeader } from "@/components/ui";

export default function NewCalendarEventPage() {
  const date = useSearchParams().get("date") || undefined;
  return (
    <>
      <PageHeader eyebrow="一起安排" title="新增日程" description="全天事项的结束日期会包含当天；带时刻事项按北京时间（Asia/Shanghai）填写。" backHref="/calendar" />
      <CalendarEditor initialDate={date} />
    </>
  );
}
