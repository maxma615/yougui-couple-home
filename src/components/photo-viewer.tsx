"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, ImageOff, X } from "lucide-react";

import type { Moment, MomentPhoto } from "@/components/home-types";
import { photoUrl } from "@/components/photo-url";

export type PhotoViewerEntry = {
  moment: Moment;
  photo: MomentPhoto;
  photoIndex: number;
};

type PhotoViewerProps = {
  entries: PhotoViewerEntry[];
  photoId: string;
  onSelectPhoto: (id: string) => void;
  onClose: () => void;
  returnFocusTo: HTMLElement | null;
  showMomentLink?: boolean;
};

type TouchStart = { pointerId: number; x: number; y: number };

export function PhotoViewer({
  entries,
  photoId,
  onSelectPhoto,
  onClose,
  returnFocusTo,
  showMomentLink = false,
}: PhotoViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const touchStartRef = useRef<TouchStart | null>(null);
  const currentIndex = Math.max(0, entries.findIndex((entry) => entry.photo.id === photoId));
  const current = entries[currentIndex];
  const navigationRef = useRef({ onClose, onSelectPhoto, entries, currentIndex });
  navigationRef.current = { onClose, onSelectPhoto, entries, currentIndex };
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [current?.photo.id]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      closingRef.current = true;
      navigationRef.current.onClose();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      navigationRef.current.onClose();
    }, 220);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !current) return;
    const previousFocus = returnFocusTo?.isConnected ? returnFocusTo : (document.activeElement as HTMLElement | null);
    dialog.showModal();
    closeRef.current?.focus();

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (closingRef.current) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectRelative(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        selectRelative(1);
      }
    }
    function onCancel(event: Event) {
      event.preventDefault();
      requestClose();
    }

    dialog.addEventListener("keydown", onKeyDown);
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("keydown", onKeyDown);
      dialog.removeEventListener("cancel", onCancel);
      if (dialog.open) dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [requestClose, returnFocusTo]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  if (!current) return null;

  function selectRelative(direction: number) {
    const active = navigationRef.current;
    if (active.entries.length < 2 || closingRef.current) return;
    const nextIndex = (active.currentIndex + direction + active.entries.length) % active.entries.length;
    active.onSelectPhoto(active.entries[nextIndex].photo.id);
  }

  function onDialogClick(event: ReactMouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  function onTouchPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    if (!event.isPrimary || touchStartRef.current) {
      touchStartRef.current = null;
      return;
    }
    touchStartRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onTouchPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId || event.pointerType !== "touch") return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return;
    selectRelative(deltaX < 0 ? 1 : -1);
  }

  const count = entries.length;
  const entryNumber = current.photoIndex + 1;

  return (
    <dialog ref={dialogRef} className="space-photo-viewer" aria-label={"大图查看：" + current.moment.title} data-gallery-motion={closing ? "closing" : "open"} onClick={onDialogClick}>
      <div className="space-photo-viewer__inner">
        <div className="space-photo-viewer__bar">
          <p className="space-photo-viewer__label">{current.moment.title} · 第 {entryNumber} 张</p>
          <p className="space-photo-viewer__counter">{String(currentIndex + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</p>
          <button ref={closeRef} className="space-gallery__icon-button" type="button" aria-label="关闭大图查看" disabled={closing} onClick={requestClose}><X size={21} /></button>
        </div>
        <div className="space-photo-viewer__stage">
          <button className="space-gallery__icon-button" type="button" aria-label="上一张照片" disabled={count < 2 || closing} onClick={() => selectRelative(-1)}><ChevronLeft size={23} /></button>
          <div
            className="space-photo-viewer__image-wrap"
            style={{ touchAction: "pan-y" }}
            onPointerDown={onTouchPointerDown}
            onPointerUp={onTouchPointerUp}
            onPointerCancel={() => { touchStartRef.current = null; }}
          >
            {failed ? (
              <div className="space-memory__broken" role="status">
                <ImageOff size={23} aria-hidden="true" />
                <p>照片暂时加载失败。</p>
                <button className="space-gallery__retry" type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>重试加载</button>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={current.photo.id + "-" + attempt}
                className="space-photo-viewer__image"
                src={photoUrl(current.photo.id, { retry: attempt })}
                alt={current.moment.title + "，第 " + entryNumber + " 张照片"}
                fetchPriority="high"
                decoding="async"
                onError={() => setFailed(true)}
              />
            )}
          </div>
          <button className="space-gallery__icon-button" type="button" aria-label="下一张照片" disabled={count < 2 || closing} onClick={() => selectRelative(1)}><ChevronRight size={23} /></button>
        </div>
        <div className="space-photo-viewer__footer">
          {showMomentLink ? <Link className="quiet-button" href={"/moments/" + current.moment.id}>查看这段回忆</Link> : null}
          <span>滑动、方向键或两侧按钮浏览照片</span>
        </div>
      </div>
    </dialog>
  );
}
