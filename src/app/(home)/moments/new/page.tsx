"use client";

import { MomentEditor } from "@/components/resource-forms";
import { PageHeader } from "@/components/ui";

export default function NewMomentPage() {
  return (
    <div className="space-editor">
      <PageHeader eyebrow="留住今天" title="添加照片或点滴" description="给这一天一个标题，写下你们想记住的事。" backHref="/moments" />
      <div className="space-editor__steps" aria-label="添加点滴的两个步骤">
        <div className="space-editor__step"><span className="space-editor__step-number">01 / MEMORY</span><p>填写标题、日期与想留下的话。</p></div>
        <div className="space-editor__step"><span className="space-editor__step-number">02 / PHOTOS</span><p>保存后，继续为这篇点滴添加照片。</p></div>
      </div>
      <MomentEditor />
    </div>
  );
}
