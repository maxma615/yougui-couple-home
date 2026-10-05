"use client";

import Link from "next/link";
import { useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Image as ImageIcon, LayoutGrid, PanelsTopLeft } from "lucide-react";

import type { ItemList, Moment, MomentPhoto } from "@/components/home-types";
import { photoUrl } from "@/components/photo-url";
import { AddLink, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";

type DatedGroup = { date: string; moments: Moment[] };
type CoverEntry = { moment: Moment; photo: MomentPhoto; photoNumber: number };
type GalleryView = "cover" | "wall";

function groupByDate(items: Moment[]): DatedGroup[] {
  const groups: DatedGroup[] = [];
  for (const moment of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === moment.date) last.moments.push(moment);
    else groups.push({ date: moment.date, moments: [moment] });
  }
  return groups;
}

function displayDate(date: string): string {
  return date.split("-").join(" . ");
}

function GalleryTile({ moment, photo }: { moment: Moment; photo?: MomentPhoto }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <Link
      className={photo ? "space-gallery__tile" : "space-gallery__tile space-gallery__tile--text"}
      href={`/moments/${moment.id}`}
      aria-label={photo ? `${moment.title}，${moment.date}，${moment.photos.length} 张照片` : `${moment.title}，${moment.date}，文字记录`}
    >
      {photo && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="space-gallery__tile-image" src={photoUrl(photo.id, { variant: "thumbnail" })} alt={`${moment.title}的照片`} loading="lazy" decoding="async" onError={() => setImageFailed(true)} />
      ) : null}
      {photo ? <span className="space-gallery__tile-veil" aria-hidden="true" /> : null}
      <span className="space-gallery__tile-copy">
        <strong className="space-gallery__tile-title">{moment.title}</strong>
        {photo ? (
          <span className="space-gallery__tile-meta"><Camera size={13} aria-hidden="true" />{imageFailed ? "照片暂时无法加载 · 打开点滴重试" : `${moment.photos.length} 张照片`}</span>
        ) : (
          <>
            <span className="space-gallery__tile-body">{moment.body || "这段记忆留在文字里。"}</span>
            <span className="space-gallery__tile-meta"><ImageIcon size={13} aria-hidden="true" />文字记录</span>
          </>
        )}
      </span>
    </Link>
  );
}

export default function MomentsPage() {
  const resource = useResource<ItemList<Moment>>("/api/moments");
  const [view, setView] = useState<GalleryView>("cover");
  const [coverIndex, setCoverIndex] = useState(0);
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverAttempt, setCoverAttempt] = useState(0);

  const items = resource.data?.items ?? [];
  const groups = groupByDate(items);
  const photos: CoverEntry[] = items.flatMap((moment) => moment.photos.map((photo, index) => ({ moment, photo, photoNumber: index + 1 })));
  const selectedCover = photos.length ? photos[coverIndex % photos.length] : undefined;

  function changeCover(amount: number) {
    if (photos.length < 2) return;
    setCoverIndex((current) => (current + amount + photos.length) % photos.length);
    setCoverFailed(false);
    setCoverAttempt(0);
  }

  function retryCover() {
    setCoverFailed(false);
    setCoverAttempt((attempt) => attempt + 1);
  }

  return (
    <div className="space-gallery" data-gallery-view={view}>
      <PageHeader
        eyebrow="PRIVATE IMAGE ARCHIVE"
        title="相册与点滴"
        description="把照片和文字，留在原来的那一天。"
        action={<AddLink href="/moments/new">添加照片或点滴</AddLink>}
      />

      {resource.error && resource.data ? <StatusMessage tone="error">同步失败：{resource.error}。仍可浏览最近一次读取的内容。</StatusMessage> : null}

      {resource.loading && !resource.data ? <LoadingState label="正在整理你们的照片…" /> : !resource.data ? (
        <ErrorState message={resource.error || "暂时无法读取点滴"} onRetry={() => void resource.refresh()} />
      ) : !items.length ? (
        <section className="space-gallery__empty" aria-labelledby="gallery-empty-title">
          <p className="space-gallery__empty-label">OUR FIRST FRAME</p>
          <h2 id="gallery-empty-title">这里还没有你们的照片。</h2>
          <p>从一张想留住的照片开始，写下日期与想说的话。</p>
          <AddLink href="/moments/new">添加第一张照片</AddLink>
        </section>
      ) : (
        <>
          <div className="space-gallery__toolbar">
            <p className="space-gallery__count">{items.length} 次收藏 <span aria-hidden="true">·</span> {photos.length} 张照片</p>
            {photos.length ? (
              <div className="space-gallery__switch" role="group" aria-label="相册浏览方式">
                <button type="button" aria-pressed={view === "cover"} onClick={() => setView("cover")}><PanelsTopLeft size={15} />封面</button>
                <button type="button" aria-pressed={view === "wall"} onClick={() => setView("wall")}><LayoutGrid size={15} />照片墙</button>
              </div>
            ) : <span className="space-gallery__view-label">TEXT / MEMORY</span>}
          </div>

          {photos.length === 0 ? (
            <section className="space-gallery__empty" aria-labelledby="gallery-no-photo-title">
              <p className="space-gallery__empty-label">NO PHOTOGRAPHS YET</p>
              <h2 id="gallery-no-photo-title">文字先替你们记下了这些日子。</h2>
              <p>这些文字先记下了你们的日子。挑一篇点滴，为它添上照片。</p>
              <AddLink href="/moments/new">添加照片或点滴</AddLink>
            </section>
          ) : view === "cover" && selectedCover ? (
            <section className="space-cover" aria-label="封面照片浏览">
              {coverFailed ? (
                <div className="space-cover__error" role="status">
                  <ImageIcon size={25} aria-hidden="true" />
                  <p>这张照片暂时无法显示，点按重试，或打开这篇点滴继续查看。</p>
                  <button className="space-gallery__retry" type="button" onClick={retryCover}>重试封面</button>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${selectedCover.photo.id}-${coverAttempt}`}
                  className="space-cover__image"
                  src={photoUrl(selectedCover.photo.id, { variant: "preview", retry: coverAttempt })}
                  alt={`${selectedCover.moment.title} · ${selectedCover.photo.filename}`}
                  fetchPriority="high"
                  decoding="async"
                  onError={() => setCoverFailed(true)}
                />
              )}
              <span className="space-cover__veil" aria-hidden="true" />
              <div className="space-cover__copy" aria-live="polite">
                <p className="space-cover__kicker">{displayDate(selectedCover.moment.date)} <span>·</span> {String(coverIndex + 1).padStart(2, "0")} / {String(photos.length).padStart(2, "0")}</p>
                <h2 className="space-cover__title">{selectedCover.moment.title}</h2>
                <p className="space-cover__meta"><span>{selectedCover.photo.filename}</span><span>·</span><span>{selectedCover.photoNumber} / {selectedCover.moment.photos.length} 张</span></p>
                <Link className="space-cover__detail" href={`/moments/${selectedCover.moment.id}`}>打开这篇点滴 <ChevronRight size={16} /></Link>
              </div>
              {photos.length > 1 ? (
                <div className="space-cover__controls" aria-label="切换封面照片">
                  <button className="space-gallery__icon-button" type="button" aria-label="上一张封面" onClick={() => changeCover(-1)}><ChevronLeft size={20} /></button>
                  <button className="space-gallery__icon-button" type="button" aria-label="下一张封面" onClick={() => changeCover(1)}><ChevronRight size={20} /></button>
                </div>
              ) : null}
            </section>
          ) : null}

          {items.length > 0 ? (
            <div className="space-gallery__timeline" aria-label="按日期排列的点滴">
              {groups.map((group) => {
                const visibleMoments = view === "cover" && selectedCover
                  ? group.moments.filter((moment) => moment.id !== selectedCover.moment.id)
                  : group.moments;
                if (!visibleMoments.length) return null;
                return (
                  <section className="space-gallery__group" key={group.date} aria-label={`${displayDate(group.date)} 的点滴`}>
                    <div className="space-gallery__group-heading">
                      <h2 className="space-gallery__group-date"><time dateTime={group.date}>{displayDate(group.date)}</time></h2>
                      <span className="space-gallery__group-count">{String(visibleMoments.length).padStart(2, "0")} ENTRIES</span>
                    </div>
                    <div className={visibleMoments.length === 1 ? "space-gallery__grid space-gallery__grid--single" : "space-gallery__grid"}>
                      {visibleMoments.map((moment) => <GalleryTile key={moment.id} moment={moment} photo={moment.photos[0]} />)}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
