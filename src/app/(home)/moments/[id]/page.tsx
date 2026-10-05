"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { Camera, ChevronLeft, ChevronRight, ImageOff, ImagePlus, LoaderCircle, Pencil, Trash2, X } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import { DeleteConfirmButton } from "@/components/delete-confirm";
import type { Moment, MomentPhoto } from "@/components/home-types";
import { photoUrl } from "@/components/photo-url";
import { AuditLine, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";

type PhotoUploadResult = { photo: MomentPhoto; version: number };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function displayDate(date: string): string {
  return date.split("-").join(" . ");
}

function appendMomentPhoto(moment: Moment | null, momentId: string, photo: MomentPhoto, version: number): Moment | null {
  if (!moment || moment.id !== momentId || moment.version > version) return moment;
  return {
    ...moment,
    version,
    photos: moment.photos.some((entry) => entry.id === photo.id) ? moment.photos : [...moment.photos, photo],
  };
}

function PhotoFrame({
  moment,
  photo,
  index,
  count,
  deleteDisabled,
  onOpen,
  onDelete,
}: {
  moment: Moment;
  photo: MomentPhoto;
  index: number;
  count: number;
  deleteDisabled: boolean;
  onOpen: (element: HTMLButtonElement) => void;
  onDelete: () => Promise<void>;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);


  const isLead = index === 0;

  return (
    <figure className={isLead ? "space-memory__lead space-memory__lead--active" : "space-memory__lead"}>
      {failed ? (
        <div className="space-memory__broken" role="status">
          <ImageOff size={22} aria-hidden="true" />
          <p>这张照片暂时无法显示。</p>
          <button className="space-gallery__retry" type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>重试加载</button>
        </div>
      ) : (
        <button className="space-memory__image-open" type="button" aria-label={`放大查看：${photo.filename}`} onClick={(event) => onOpen(event.currentTarget)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`${photo.id}-${attempt}`}
            className="space-memory__lead-photo"
            src={photoUrl(photo.id, { variant: "preview", retry: attempt })}
            alt={`${moment.title}：${photo.filename}`}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            onError={() => setFailed(true)}
          />
        </button>
      )}
      <DeleteConfirmButton kind="照片" name={photo.filename} onConfirm={onDelete} disabled={deleteDisabled} className="space-photo-delete">
        <X size={18} aria-hidden="true" />
      </DeleteConfirmButton>
      <figcaption className="space-memory__lead-caption">
        <span className="space-memory__lead-name">{photo.filename} · {formatBytes(photo.bytes)}</span>
        <span className="space-gallery__count">{String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</span>
      </figcaption>
    </figure>
  );
}

function PhotoViewer({
  moment,
  photo,
  index,
  count,
  onClose,
  onPrevious,
  onNext,
  returnFocusTo,
}: {
  moment: Moment;
  photo: MomentPhoto;
  index: number;
  count: number;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  returnFocusTo: HTMLElement | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const navigationRef = useRef({ onClose, onPrevious, onNext });
  navigationRef.current = { onClose, onPrevious, onNext };
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState(false);

  useLayoutEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [photo.id]);

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
    if (!dialog) return;
    const previousFocus = returnFocusTo?.isConnected ? returnFocusTo : (document.activeElement as HTMLElement | null);
    dialog.showModal();
    closeRef.current?.focus();

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (closingRef.current) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigationRef.current.onPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        navigationRef.current.onNext();
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

  function onDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) requestClose();
  }

  return (
    <dialog ref={dialogRef} className="space-photo-viewer" aria-label={`大图查看：${moment.title}`} data-gallery-motion={closing ? "closing" : "open"} onClick={onDialogClick}>
      <div className="space-photo-viewer__inner">
        <div className="space-photo-viewer__bar">
          <p className="space-photo-viewer__label">{moment.title} · {photo.filename}</p>
          <p className="space-photo-viewer__counter">{String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</p>
          <button ref={closeRef} className="space-gallery__icon-button" type="button" aria-label="关闭大图查看" disabled={closing} onClick={requestClose}><X size={21} /></button>
        </div>
        <div className="space-photo-viewer__stage">
          <button className="space-gallery__icon-button" type="button" aria-label="上一张照片" disabled={count < 2 || closing} onClick={onPrevious}><ChevronLeft size={23} /></button>
          <div className="space-photo-viewer__image-wrap">
            {failed ? (
              <div className="space-memory__broken" role="status">
                <ImageOff size={23} aria-hidden="true" />
                <p>照片暂时加载失败。</p>
                <button className="space-gallery__retry" type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>重试加载</button>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${photo.id}-${attempt}`}
                className="space-photo-viewer__image"
                src={photoUrl(photo.id, { retry: attempt })}
                alt={`${moment.title}：${photo.filename}`}
                fetchPriority="high"
                decoding="async"
                onError={() => setFailed(true)}
              />
            )}
          </div>
          <button className="space-gallery__icon-button" type="button" aria-label="下一张照片" disabled={count < 2 || closing} onClick={onNext}><ChevronRight size={23} /></button>
        </div>
        <div className="space-photo-viewer__footer">使用方向键或两侧按钮浏览照片</div>
      </div>
    </dialog>
  );
}

export default function MomentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const resource = useResource<Moment>(`/api/moments/${encodeURIComponent(id)}`);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadTone, setUploadTone] = useState<"neutral" | "success" | "error">("neutral");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [deletingPhoto, setDeletingPhoto] = useState<string | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerOpener, setViewerOpener] = useState<HTMLElement | null>(null);
  const item = resource.data;
  const photoCount = item?.photos.length ?? 0;
  useEffect(() => {
    setSelectedPhotoIndex(current => Math.min(current, Math.max(photoCount - 1, 0)));
    setViewerIndex(current => current !== null && current >= photoCount ? null : current);
  }, [photoCount]);

  const closeViewer = useCallback(() => setViewerIndex(null), []);
  const moveSelectedPhoto = useCallback((amount: number) => {
    const count = resource.data?.photos.length ?? 0;
    if (count < 2) return;
    setSelectedPhotoIndex((current) => (current + amount + count) % count);
  }, [resource.data?.photos.length]);
  const moveViewerPhoto = useCallback((amount: number) => {
    const count = resource.data?.photos.length ?? 0;
    if (count < 2) return;
    setViewerIndex((current) => current === null ? null : (current + amount + count) % count);
  }, [resource.data?.photos.length]);

  async function uploadFiles(files: File[]) {
    if (!item || !files.length) return;
    setUploading(true);
    setUploadTone("neutral");
    let current = item;
    let completed = 0;
    let remaining = [...files];
    try {
      for (const file of files) {
        setUploadStatus(`正在上传 ${file.name}（${completed + 1}/${files.length}）…`);
        const form = new FormData();
        form.append("file", file);
        form.append("version", String(current.version));
        const result = await apiRequest<PhotoUploadResult>(`/api/moments/${item.id}/photos`, { method: "POST", body: form });
        current = appendMomentPhoto(current, item.id, result.photo, result.version) ?? current;
        resource.setData((latest) => appendMomentPhoto(latest, item.id, result.photo, result.version));
        completed += 1;
        remaining = remaining.slice(1);
        setPendingFiles(remaining);
      }
      setUploadTone("success");
      setUploadStatus(`${completed} 张照片已上传。`);
    } catch (requestError) {
      setUploadTone("error");
      setPendingFiles(remaining);
      setUploadStatus(`${completed ? `本次已成功 ${completed} 张；` : ""}${remaining[0]?.name ? `“${remaining[0].name}”上传失败：` : ""}${errorMessage(requestError)}`);
      if (requestError instanceof ApiError && requestError.status === 409) await resource.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;
    setPendingFiles(selected);
    void uploadFiles(selected);
  }

  async function deletePhoto(photo: MomentPhoto): Promise<void> {
    if (!item) throw new Error("这篇点滴暂时无法读取，请刷新后再试。");
    if (deletingPhoto && deletingPhoto !== photo.id) throw new Error("另一张照片正在删除，请稍后重试。");
    setDeletingPhoto(photo.id);
    try {
      const result = await apiRequest<{ ok: true; version: number }>(`/api/photos/${photo.id}`, {
        method: "DELETE",
        body: jsonBody({ version: item.version }),
      });
      resource.setData((current) => {
        if (!current || current.id !== item.id || current.version > result.version) return current;
        return { ...current, version: result.version, photos: current.photos.filter((entry) => entry.id !== photo.id) };
      });
      if (viewerIndex !== null) setViewerIndex(null);
      setUploadTone("success");
      setUploadStatus(`照片“${photo.filename}”已删除。`);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) await resource.refresh();
      throw new Error(errorMessage(requestError));
    } finally {
      setDeletingPhoto(null);
    }
  }

  async function removeMoment(): Promise<void> {
    if (!item) throw new Error("这篇点滴暂时无法读取，请刷新后再试。");
    try {
      await apiRequest<{ ok: true }>(`/api/moments/${item.id}`, { method: "DELETE", body: jsonBody({ version: item.version }) });
      router.replace("/moments");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) await resource.refresh();
      throw new Error(errorMessage(requestError));
    }
  }

  if (resource.loading && !item) return <LoadingState />;
  if (!item) return <ErrorState message={resource.error || "没有找到这篇点滴"} onRetry={() => void resource.refresh()} />;

  const safeSelectedIndex = Math.min(selectedPhotoIndex, Math.max(item.photos.length - 1, 0));
  const selectedPhoto = item.photos[safeSelectedIndex];
  const viewerPhoto = viewerIndex === null ? undefined : item.photos[viewerIndex];

  return (
    <div className="space-memory">
      {resource.error ? <div className="space-memory__status"><StatusMessage tone="error">同步失败：{resource.error}。继续显示上一次读取的内容。</StatusMessage></div> : null}
      <PageHeader
        eyebrow="ONE DAY, KEPT"
        title={item.title}
        description="这一页，留着那一天的照片和心情。"
        backHref="/moments"
        action={<Link className="button" href={`/moments/${item.id}/edit`}><Pencil size={17} /> 编辑文字</Link>}
      />

      <p className="space-memory__date-line"><Camera size={16} aria-hidden="true" /><time dateTime={item.date}>{displayDate(item.date)}</time></p>

      {selectedPhoto ? (
        <section className="space-memory__gallery" aria-label="点滴照片序列">
          <PhotoFrame
            key={selectedPhoto.id}
            moment={item}
            photo={selectedPhoto}
            index={safeSelectedIndex}
            count={item.photos.length}
            deleteDisabled={deletingPhoto !== null && deletingPhoto !== selectedPhoto.id}
            onOpen={(element) => { setViewerOpener(element); setViewerIndex(safeSelectedIndex); }}
            onDelete={() => deletePhoto(selectedPhoto)}
          />
          {item.photos.length > 1 ? (
            <>
              <div className="space-memory__actions" aria-label="浏览照片序列">
                <button className="space-gallery__icon-button" type="button" aria-label="上一张照片" onClick={() => moveSelectedPhoto(-1)}><ChevronLeft size={21} /></button>
                <button className="space-gallery__icon-button" type="button" aria-label="下一张照片" onClick={() => moveSelectedPhoto(1)}><ChevronRight size={21} /></button>
                <span className="space-gallery__count">点按照片可放大 · {item.photos.length} 张</span>
              </div>
              <div className="space-memory__sequence" aria-label="照片缩略图">
                {item.photos.map((photo, index) => (
                  <button
                    className="space-memory__thumb"
                    key={photo.id}
                    type="button"
                    aria-label={`查看照片：${photo.filename}`}
                    aria-current={index === safeSelectedIndex}
                    onClick={() => setSelectedPhotoIndex(index)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl(photo.id, { variant: "thumbnail" })} alt="" loading={index === 0 ? "eager" : "lazy"} decoding="async" />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : (
        <section className="space-memory__upload" aria-label="没有照片">
          <h2>文字也可以把这一天留下。</h2>
          <p className="space-memory__upload-intro">这篇点滴还没有照片。选一张照片，为它添上画面。</p>
        </section>
      )}

      <article className="space-memory__copy">
        <p className="eyebrow">NOTES FROM THAT DAY</p>
        <h2>{item.title}</h2>
        {item.body ? <p className="space-memory__body">{item.body}</p> : <p className="space-memory__no-copy">还没有写下想说的话。</p>}
        <AuditLine record={item} members={session?.home?.members} />
      </article>

      <section className="space-memory__upload" aria-labelledby="moment-upload-title">
        <h2 id="moment-upload-title">{item.photos.length ? "继续收藏照片" : "给这段点滴添一张照片"}</h2>
        <p className="space-memory__upload-intro">添加一张或多张照片，让这段回忆更完整。</p>
        <div className="space-memory__picker">
          <input ref={inputRef} id="moment-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || pendingFiles.length > 0} onChange={upload} />
          <label htmlFor="moment-photos"><ImagePlus size={22} aria-hidden="true" /><strong>选择照片</strong><span>点击选择一张或多张 JPEG、PNG、WebP 图片</span></label>
        </div>
        <p className="space-memory__help">支持 JPEG、PNG 和 WebP。若上传中断，可以重试剩余照片。</p>
        {uploadStatus ? <div className="space-memory__error"><StatusMessage tone={uploadTone}>{uploadStatus}</StatusMessage></div> : null}
        {pendingFiles.length ? (
          <div className="space-memory__actions">
            <button className="button" type="button" disabled={uploading} onClick={() => void uploadFiles(pendingFiles)}>{uploading ? <LoaderCircle className="spin" size={17} /> : <ImagePlus size={17} />}{uploading ? "正在重试…" : `重试剩余 ${pendingFiles.length} 张`}</button>
            <button className="button button--secondary" type="button" disabled={uploading} onClick={() => { setPendingFiles([]); setUploadTone("neutral"); setUploadStatus("已取消剩余照片上传，可以重新选择文件。"); }}>取消剩余上传</button>
          </div>
        ) : null}
      </section>

      <div className="space-memory__actions" aria-label="点滴管理">
        <Link className="button button--secondary" href={`/moments/${item.id}/edit`}><Pencil size={17} /> 编辑文字</Link>
        <DeleteConfirmButton kind="点滴" name={item.title} onConfirm={removeMoment}>
          <><Trash2 size={17} aria-hidden="true" />删除这篇点滴</>
        </DeleteConfirmButton>
      </div>

      {viewerPhoto ? (
        <PhotoViewer
          moment={item}
          photo={viewerPhoto}
          index={viewerIndex ?? 0}
          count={item.photos.length}
          onClose={closeViewer}
          onPrevious={() => moveViewerPhoto(-1)}
          onNext={() => moveViewerPhoto(1)}
          returnFocusTo={viewerOpener}
        />
      ) : null}
    </div>
  );
}
