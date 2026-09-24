"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, ArrowLeft, Heart, LoaderCircle, Plus } from "lucide-react";

import type { AuditMember, AuditedRecord, Member } from "@/components/home-types";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? "brand-mark brand-mark--compact" : "brand-mark"} aria-hidden="true">
      <Heart fill="currentColor" strokeWidth={2.2} />
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  backHref,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  backHref?: string;
}) {
  return (
    <header className="page-header">
      <div className="page-header__copy">
        {backHref ? (
          <Link className="back-link" href={backHref}>
            <ArrowLeft size={18} /> 返回
          </Link>
        ) : null}
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}

export function AddLink({ href, children = "新增" }: { href: string; children?: ReactNode }) {
  return (
    <Link className="button" href={href}>
      <Plus size={18} /> {children}
    </Link>
  );
}

export function LoadingState({ label = "正在读取…" }: { label?: string }) {
  return (
    <div className="state-card" role="status">
      <LoaderCircle className="spin" size={24} />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-card state-card--error" role="alert">
      <AlertCircle size={24} />
      <p>{message}</p>
      {onRetry ? (
        <button className="button button--secondary" type="button" onClick={onRetry}>
          再试一次
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  href,
  action,
}: {
  title: string;
  description: string;
  href: string;
  action: string;
}) {
  return (
    <section className="empty-card">
      <BrandMark compact />
      <h2>{title}</h2>
      <p>{description}</p>
      <AddLink href={href}>{action}</AddLink>
    </section>
  );
}

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="field-error">{message}</p> : null;
}

function memberName(value: AuditMember, members?: Member[]) {
  if (!value) return "未知成员";
  if (typeof value === "object") return value.displayName;
  return members?.find((member) => member.id === value)?.displayName || value;
}

export function formatShanghaiTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function AuditLine({ record, members }: { record: AuditedRecord; members?: Member[] }) {
  return (
    <p className="audit-line">
      {memberName(record.createdBy, members)} 创建于 {formatShanghaiTime(record.createdAt)}
      <span aria-hidden="true"> · </span>
      {memberName(record.updatedBy, members)} 最后修改于 {formatShanghaiTime(record.updatedAt)}
    </p>
  );
}

export function confirmDelete(kind: string, name: string): boolean {
  return window.confirm(`确定删除${kind}“${name}”吗？删除后无法恢复。`);
}

export function StatusMessage({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "error" }) {
  return <p className={`status-message status-message--${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</p>;
}
