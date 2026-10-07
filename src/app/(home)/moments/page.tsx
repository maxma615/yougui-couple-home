"use client";

import "@/components/album-browsing.css";

import Link from "next/link";
import { useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Image as ImageIcon, LayoutGrid, PanelsTopLeft } from "lucide-react";

import { PhotoViewer, type PhotoViewerEntry } from "@/components/photo-viewer";
import type { ItemList, Moment, MomentPhoto } from "@/components/home-types";
import { photoUrl } from "@/components/photo-url";
import { AddLink, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";

type GalleryView = "cover" | "wall";
type WallEntry =
  | { kind: "photo"; moment: Moment; photo: MomentPhoto; photoIndex: number }
  | { kind: "text"; moment: Moment };
type DatedGroup = {
  date: string;
  moments: Moment[];
  entries: WallEntry[];
  photoCount: number;
};
type OpenPhoto = (photoId: string, opener: HTMLButtonElement) => void;

function displayDate(date: string): string {
  return date.split("-").join(" . ");
}

function groupByDate(items: Moment[]): DatedGroup[] {
  const groups: DatedGroup[] = [];
  for (const moment of items) {
    let group = groups[groups.length - 1];
    if (!group || group.date !== moment.date) {
      group = { date: moment.date, moments: [], entries: [], photoCount: 0 };
      groups.push(group);
    }

    group.moments.push(moment);
    if (moment.photos.length) {
      moment.photos.forEach((photo, photoIndex) => {
        group.entries.push({ kind: "photo", moment, photo, photoIndex });
        group.photoCount += 1;
      });
    } else {
      group.entries.push({ kind: "text", moment });
    }
  }
  return groups;
}

function PhotoTile({
  moment,
  photo,
  photoIndex,
  onOpen,
}: {
  moment: Moment;
  photo: MomentPhoto;
  photoIndex: number;
  onOpen: OpenPhoto;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <button
      className="space-gallery__tile album-photo-tile"
      type="button"
      aria-label={"查看照片：" + moment.title + "，第 " + (photoIndex + 1) + " 张照片"}
      onClick={(event) => onOpen(photo.id, event.currentTarget)}
    >
      {imageFailed ? (
        <span className="album-photo-tile__placeholder" aria-hidden="true">
          <ImageIcon size={22} />
          <span>照片暂时无法加载</span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="space-gallery__tile-image"
          src={photoUrl(photo.id, { variant: "thumbnail" })}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      )}
      <span className="album-photo-tile__caption">
        <strong className="album-photo-tile__title">{moment.title}</strong>
        <span className="album-photo-tile__meta">
          <time dateTime={moment.date}>{displayDate(moment.date)}</time>
          <span aria-hidden="true">·</span>
          <span>第 {String(photoIndex + 1).padStart(2, "0")} / {String(moment.photos.length).padStart(2, "0")} 张</span>
        </span>
      </span>
    </button>
  );
}

function TextTile({ moment }: { moment: Moment }) {
  return (
    <Link
      className="album-text-tile"
      href={"/moments/" + moment.id}
      aria-label={"打开文字点滴：" + moment.title + "，" + moment.date}
    >
      <span className="album-text-tile__kicker"><ImageIcon size={14} aria-hidden="true" />文字记录</span>
      <strong className="album-text-tile__title">{moment.title}</strong>
      <span className="album-text-tile__date"><time dateTime={moment.date}>{displayDate(moment.date)}</time></span>
      <span className="album-text-tile__body">{moment.body || "这段记忆留在文字里。"}</span>
    </Link>
  );
}

function MemoryTile({ moment }: { moment: Moment }) {
  const [imageFailed, setImageFailed] = useState(false);
  const photo = moment.photos[0];

  return (
    <Link
      className="space-gallery__tile album-memory-tile"
      href={"/moments/" + moment.id}
      aria-label={"打开点滴：" + moment.title + "，" + moment.date + "，" + moment.photos.length + " 张照片"}
    >
      {photo && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="space-gallery__tile-image album-memory-tile__image"
          src={photoUrl(photo.id, { variant: "thumbnail" })}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="album-memory-tile__placeholder" aria-hidden="true">
          {photo ? <ImageIcon size={20} /> : <Camera size={20} />}
        </span>
      )}
      <span className="album-memory-tile__caption">
        <strong>{moment.title}</strong>
        <span>{moment.photos.length ? moment.photos.length + " 张照片" : "文字记录"}</span>
      </span>
    </Link>
  );
}

export default function MomentsPage() {
  const resource = useResource<ItemList<Moment>>("/api/moments");
  const [view, setView] = useState<GalleryView>("wall");
  const [coverIndex, setCoverIndex] = useState(0);
  const [coverFailed, setCoverFailed] = useState(false);
  const [coverAttempt, setCoverAttempt] = useState(0);
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null);
  const [viewerOpener, setViewerOpener] = useState<HTMLElement | null>(null);

  const items = resource.data?.items ?? [];
  const groups = groupByDate(items);
  const photos: PhotoViewerEntry[] = items.flatMap((moment) =>
    moment.photos.map((photo, photoIndex) => ({ moment, photo, photoIndex })),
  );
  const safeCoverIndex = photos.length ? coverIndex % photos.length : 0;
  const selectedCover = photos.length ? photos[safeCoverIndex] : undefined;

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

  function openPhoto(photoId: string, opener: HTMLButtonElement) {
    setViewerOpener(opener);
    setViewerPhotoId(photoId);
  }

  const onOpenPhoto: OpenPhoto = (photoId, opener) => openPhoto(photoId, opener);
  const selectedPhotoExists = viewerPhotoId !== null && photos.some((entry) => entry.photo.id === viewerPhotoId);

  return (
    <div className="space-gallery album-browsing" data-gallery-view={view}>
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
          <div className="space-gallery__toolbar album-browsing__toolbar">
            <p className="space-gallery__count">
              {items.length} 段回忆 <span aria-hidden="true">·</span> {photos.length} 张照片
            </p>
            {photos.length ? (
              <div className="space-gallery__switch" role="group" aria-label="相册浏览方式">
                <button type="button" aria-pressed={view === "wall"} onClick={() => setView("wall")}><LayoutGrid size={15} />照片墙</button>
                <button type="button" aria-pressed={view === "cover"} onClick={() => setView("cover")}><PanelsTopLeft size={15} />封面</button>
              </div>
            ) : <span className="space-gallery__view-label">TEXT / MEMORY</span>}
          </div>

          {view === "cover" && selectedCover ? (
            <section className="space-cover album-cover" aria-label="封面照片浏览">
              {coverFailed ? (
                <div className="space-cover__error" role="status">
                  <ImageIcon size={25} aria-hidden="true" />
                  <p>这张照片暂时无法显示，点按重试，或打开这篇点滴继续查看。</p>
                  <button className="space-gallery__retry" type="button" onClick={retryCover}>重试封面</button>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={selectedCover.photo.id + "-" + coverAttempt}
                  className="space-cover__image"
                  src={photoUrl(selectedCover.photo.id, { variant: "preview", retry: coverAttempt })}
                  alt={selectedCover.moment.title + "，" + selectedCover.moment.date + "，第 " + (selectedCover.photoIndex + 1) + " 张照片"}
                  fetchPriority="high"
                  decoding="async"
                  onError={() => setCoverFailed(true)}
                />
              )}
              <span className="space-cover__veil" aria-hidden="true" />
              <div className="space-cover__copy" aria-live="polite">
                <p className="space-cover__kicker">
                  {displayDate(selectedCover.moment.date)}
                  <span aria-hidden="true">·</span>
                  {String(safeCoverIndex + 1).padStart(2, "0")} / {String(photos.length).padStart(2, "0")}
                </p>
                <h2 className="space-cover__title">{selectedCover.moment.title}</h2>
                <p className="space-cover__meta">
                  第 {selectedCover.photoIndex + 1} / {selectedCover.moment.photos.length} 张
                  <span aria-hidden="true">·</span>
                  {photos.length} 张照片
                </p>
                <Link className="space-cover__detail" href={"/moments/" + selectedCover.moment.id}>
                  打开这篇点滴 <ChevronRight size={16} />
                </Link>
              </div>
              {photos.length > 1 ? (
                <div className="space-cover__controls" aria-label="切换封面照片">
                  <button className="space-gallery__icon-button" type="button" aria-label="上一张封面" onClick={() => changeCover(-1)}><ChevronLeft size={20} /></button>
                  <button className="space-gallery__icon-button" type="button" aria-label="下一张封面" onClick={() => changeCover(1)}><ChevronRight size={20} /></button>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="space-gallery__timeline album-browsing__timeline" aria-label="按日期排列的点滴">
            {groups.map((group) => {
              if (view === "cover") {
                const visibleMoments = selectedCover
                  ? group.moments.filter((moment) => moment.id !== selectedCover.moment.id)
                  : group.moments;
                if (!visibleMoments.length) return null;

                return (
                  <section className="space-gallery__group album-date-group" key={group.date} aria-label={displayDate(group.date) + " 的点滴"}>
                    <div className="space-gallery__group-heading album-date-group__heading">
                      <h2 className="space-gallery__group-date"><time dateTime={group.date}>{displayDate(group.date)}</time></h2>
                      <span className="space-gallery__group-count">{visibleMoments.length} 段回忆</span>
                    </div>
                    <div className="album-memory-grid">
                      {visibleMoments.map((moment) => <MemoryTile key={moment.id} moment={moment} />)}
                    </div>
                  </section>
                );
              }

              return (
                <section
                  className="space-gallery__group album-date-group"
                  key={group.date}
                  aria-label={displayDate(group.date) + " 的回忆，" + group.photoCount + " 张照片"}
                >
                  <div className="space-gallery__group-heading album-date-group__heading">
                    <h2 className="space-gallery__group-date"><time dateTime={group.date}>{displayDate(group.date)}</time></h2>
                    <span className="space-gallery__group-count">
                      {group.photoCount ? group.photoCount + " 张照片" : "文字记录"}
                      <span aria-hidden="true"> · </span>
                      {group.moments.length} 段回忆
                    </span>
                  </div>
                  <div className="album-photo-grid">
                    {group.entries.map((entry) => entry.kind === "photo" ? (
                      <PhotoTile
                        key={entry.photo.id}
                        moment={entry.moment}
                        photo={entry.photo}
                        photoIndex={entry.photoIndex}
                        onOpen={onOpenPhoto}
                      />
                    ) : <TextTile key={entry.moment.id} moment={entry.moment} />)}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {selectedPhotoExists ? (
        <PhotoViewer
          entries={photos}
          photoId={viewerPhotoId!}
          onSelectPhoto={setViewerPhotoId}
          onClose={() => setViewerPhotoId(null)}
          returnFocusTo={viewerOpener}
          showMomentLink
        />
      ) : null}
    </div>
  );
}
