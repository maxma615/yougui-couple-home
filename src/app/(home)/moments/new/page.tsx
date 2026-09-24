"use client";

import { MomentEditor } from "@/components/resource-forms";
import { PageHeader } from "@/components/ui";

export default function NewMomentPage() {
  return (
    <>
      <PageHeader eyebrow="留住今天" title="写一篇点滴" description="保存文字后会进入详情页继续上传照片。" backHref="/moments" />
      <MomentEditor />
    </>
  );
}

