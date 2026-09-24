"use client";

import { AnniversaryEditor } from "@/components/resource-forms";
import { PageHeader } from "@/components/ui";

export default function NewAnniversaryPage() {
  return (
    <>
      <PageHeader eyebrow="新的一页" title="新增纪念日" description="日期按 Asia/Shanghai 的纯日历日期保存。" backHref="/anniversaries" />
      <AnniversaryEditor />
    </>
  );
}

