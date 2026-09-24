"use client";

import Link from "next/link";
import { Camera, Image as ImageIcon, Sparkles } from "lucide-react";

import type { ItemList, Moment } from "@/components/home-types";
import { AddLink, EmptyState, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";

export default function MomentsPage() {
  const resource = useResource<ItemList<Moment>>("/api/moments");
  return (
    <>
      <PageHeader eyebrow="生活的细碎闪光" title="点滴时间线" description="按记录日期倒序保存你们共同经历的片段。" action={<AddLink href="/moments/new">写一篇点滴</AddLink>} />
      {resource.error && resource.data ? <StatusMessage tone="error">同步失败：{resource.error}。继续显示上一次读取的内容。</StatusMessage> : null}
      {resource.loading && !resource.data ? <LoadingState /> : !resource.data ? <ErrorState message={resource.error || "暂时无法读取点滴"} onRetry={() => void resource.refresh()} /> : !resource.data.items.length ? (
        <EmptyState title="时间线还在等第一篇" description="可以从今天的小事、一顿饭或一次散步开始。" href="/moments/new" action="写一篇点滴" />
      ) : (
        <div className="list-stack">
          {resource.data.items.map((moment) => (
            <Link className="list-card" key={moment.id} href={`/moments/${moment.id}`}>
              <div className="list-card__top"><div><p className="eyebrow">{moment.date}</p><h2>{moment.title}</h2></div><Sparkles size={20} color="var(--home-accent)" /></div>
              {moment.body ? <p className="card-copy">{moment.body.length > 150 ? `${moment.body.slice(0, 150)}…` : moment.body}</p> : null}
              <div className="meta-row">
                {moment.photos.length ? <span className="meta-chip"><Camera size={13} /> {moment.photos.length} 张照片</span> : <span className="meta-chip"><ImageIcon size={13} /> 暂无照片</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
