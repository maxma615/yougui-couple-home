"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { Camera, ChevronLeft, ChevronRight, Ellipsis, ImageOff, ImagePlus, LoaderCircle, Pencil, Trash2, Upload } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import type { Moment, MomentPhoto } from "@/components/home-types";
import { Modal } from "@/components/modal";
import { MomentEditor } from "@/components/resource-forms";
import { PhotoViewer, type PhotoViewerEntry } from "@/components/photo-viewer";
import { photoUrl } from "@/components/photo-url";
import { AuditLine, ErrorState, LoadingState, PageHeader, StatusMessage } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";
import "@/components/album-detail.css";

type PhotoUploadResult = { photo: MomentPhoto; version: number };
type DetailModalMode = "manage" | "edit" | "photos" | "deletePhoto" | "deleteMoment" | null;
type PendingPhotoDelete = { photo: MomentPhoto; index: number };

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

function LeadPhoto({
  moment,
  photo,
  index,
  count,
  onOpen,
}: {
  moment: Moment;
  photo: MomentPhoto;
  index: number;
  count: number;
  onOpen: (element: HTMLButtonElement) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  return (
    <figure className="space-memory__lead space-memory__lead--active">
      {failed ? (
        <div className="space-memory__broken" role="status">
          <ImageOff size={22} aria-hidden="true" />
          <p>这张照片暂时无法显示。</p>
          <button className="space-gallery__retry" type="button" onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>重试加载</button>
        </div>
      ) : (
        <button
          className="space-memory__image-open"
          type="button"
          aria-label={"放大查看：" + moment.title + "，第 " + (index + 1) + " 张照片"}
          onClick={(event) => onOpen(event.currentTarget)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={photo.id + "-" + attempt}
            className="space-memory__lead-photo"
            src={photoUrl(photo.id, { variant: "preview", retry: attempt })}
            alt={moment.title + "，第 " + (index + 1) + " 张照片"}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            onError={() => setFailed(true)}
          />
        </button>
      )}
      <figcaption className="space-memory__lead-caption">
        <span className="space-gallery__count">第 {index + 1} 张 · 共 {count} 张</span>
      </figcaption>
    </figure>
  );
}

export default function MomentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const resource = useResource<Moment>("/api/moments/" + encodeURIComponent(id));
  const inputRef = useRef<HTMLInputElement>(null);
  const manageButtonRef = useRef<HTMLButtonElement>(null);
  const manageActionRef = useRef<HTMLButtonElement>(null);
  const photoManagerFocusRef = useRef<HTMLButtonElement>(null);
  const confirmPhotoDeleteRef = useRef<HTMLButtonElement>(null);
  const confirmMomentDeleteRef = useRef<HTMLButtonElement>(null);
  const [modalMode, setModalMode] = useState<DetailModalMode>(null);
  const [editingSaving, setEditingSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadTone, setUploadTone] = useState<"neutral" | "success" | "error">("neutral");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [deletingPhoto, setDeletingPhoto] = useState<string | null>(null);
  const [deletingMoment, setDeletingMoment] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null);
  const [viewerOpener, setViewerOpener] = useState<HTMLElement | null>(null);
  const [pendingPhotoDelete, setPendingPhotoDelete] = useState<PendingPhotoDelete | null>(null);

  const item = resource.data;
  const photoCount = item?.photos.length ?? 0;
  const viewerEntries: PhotoViewerEntry[] = item ? item.photos.map((photo, photoIndex) => ({ moment: item, photo, photoIndex })) : [];
  const viewerEntry = viewerEntries.find((entry) => entry.photo.id === viewerPhotoId);
  const safeSelectedIndex = Math.min(selectedPhotoIndex, Math.max(photoCount - 1, 0));
  const selectedPhoto = item?.photos[safeSelectedIndex];
  const deletePhotoId = pendingPhotoDelete?.photo.id ?? null;
  const pendingDeletePhoto = pendingPhotoDelete
    ? item?.photos.find((photo) => photo.id === pendingPhotoDelete.photo.id) ?? pendingPhotoDelete.photo
    : undefined;
  const liveDeleteIndex = item && deletePhotoId ? item.photos.findIndex((photo) => photo.id === deletePhotoId) : -1;
  const currentDeleteIndex = liveDeleteIndex >= 0 ? liveDeleteIndex : pendingPhotoDelete?.index ?? 0;
  const modalBusy = uploading || editingSaving || deletingPhoto !== null || deletingMoment;

  useEffect(() => {
    setSelectedPhotoIndex((current) => Math.min(current, Math.max(photoCount - 1, 0)));
    if (viewerPhotoId && !item?.photos.some((photo) => photo.id === viewerPhotoId)) setViewerPhotoId(null);
  }, [photoCount, item?.photos, viewerPhotoId]);

  useEffect(() => {
    if (!modalMode) return;
    const frame = window.requestAnimationFrame(() => {
      if (modalMode === "deletePhoto") confirmPhotoDeleteRef.current?.focus();
      else if (modalMode === "deleteMoment") confirmMomentDeleteRef.current?.focus();
      else if (modalMode === "edit") document.getElementById("moment-title")?.focus();
      else if (modalMode === "manage") manageActionRef.current?.focus();
      else if (modalMode === "photos") photoManagerFocusRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [modalMode, deletePhotoId]);

  useEffect(() => {
    if (deletingPhoto !== null || modalMode !== "deletePhoto" || !deletePhotoId || !item || item.photos.some((photo) => photo.id === deletePhotoId)) return;
    setPendingPhotoDelete(null);
    setActionError("这张照片已被另一位成员删除。");
    setModalMode("photos");
  }, [deletePhotoId, deletingPhoto, item?.photos, modalMode]);

  const closeViewer = useCallback(() => setViewerPhotoId(null), []);
  const selectViewerPhoto = useCallback((photoId: string) => setViewerPhotoId(photoId), []);
  const moveSelectedPhoto = useCallback((amount: number) => {
    const photos = resource.data?.photos ?? [];
    if (photos.length < 2) return;
    setSelectedPhotoIndex((current) => (current + amount + photos.length) % photos.length);
  }, [resource.data?.photos.length]);

  async function uploadFiles(files: File[]) {
    const initial = resource.data;
    if (!initial || !files.length) return;
    setUploading(true);
    setUploadTone("neutral");
    setActionError(null);
    let current = initial;
    let completed = 0;
    let remaining = [...files];
    try {
      for (const file of files) {
        setUploadStatus("正在上传照片（" + (completed + 1) + "/" + files.length + "）…");
        const form = new FormData();
        form.append("file", file);
        form.append("version", String(current.version));
        const result = await apiRequest<PhotoUploadResult>("/api/moments/" + initial.id + "/photos", { method: "POST", body: form });
        current = appendMomentPhoto(current, initial.id, result.photo, result.version) ?? current;
        resource.setData((latest) => appendMomentPhoto(latest, initial.id, result.photo, result.version));
        completed += 1;
        remaining = remaining.slice(1);
        setPendingFiles(remaining);
      }
      setUploadTone("success");
      setUploadStatus(completed + " 张照片已上传。");
    } catch (requestError) {
      setUploadTone("error");
      setPendingFiles(remaining);
      const diagnostic = remaining[0]?.name ? "“" + remaining[0].name + "”上传失败：" : "照片上传失败：";
      setUploadStatus((completed ? "本次已成功 " + completed + " 张；" : "") + diagnostic + errorMessage(requestError));
      if (requestError instanceof ApiError && requestError.status === 409) await resource.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setPendingFiles(files);
    void uploadFiles(files);
  }

  function openManager() {
    setActionError(null);
    setViewerPhotoId(null);
    setModalMode("manage");
  }

  function openPhotoManager() {
    setActionError(null);
    setUploadStatus(null);
    setUploadTone("neutral");
    setModalMode("photos");
  }

  async function deletePhoto(photo: MomentPhoto): Promise<void> {
    const latest = resource.data;
    if (!latest) throw new Error("这篇点滴暂时无法读取，请刷新后再试。");
    if (deletingPhoto && deletingPhoto !== photo.id) throw new Error("另一张照片正在删除，请稍后重试。");
    setDeletingPhoto(photo.id);
    setActionError(null);
    try {
      const result = await apiRequest<{ ok: true; version: number }>("/api/photos/" + photo.id, {
        method: "DELETE",
        body: jsonBody({ version: latest.version }),
      });
      resource.setData((current) => {
        if (!current || current.id !== latest.id || current.version > result.version) return current;
        return { ...current, version: result.version, photos: current.photos.filter((entry) => entry.id !== photo.id) };
      });
      if (viewerPhotoId === photo.id) setViewerPhotoId(null);
      setUploadTone("success");
      setUploadStatus("照片已删除。");
      setPendingPhotoDelete(null);
      setModalMode("photos");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) await resource.refresh();
      setActionError(errorMessage(requestError));
      throw new Error(errorMessage(requestError));
    } finally {
      setDeletingPhoto(null);
    }
  }

  async function removeMoment(): Promise<void> {
    const latest = resource.data;
    if (!latest) throw new Error("这篇点滴暂时无法读取，请刷新后再试。");
    setDeletingMoment(true);
    setActionError(null);
    try {
      await apiRequest<{ ok: true }>("/api/moments/" + latest.id, {
        method: "DELETE",
        body: jsonBody({ version: latest.version }),
      });
      router.replace("/moments");
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 409) await resource.refresh();
      setActionError(errorMessage(requestError));
      throw new Error(errorMessage(requestError));
    } finally {
      setDeletingMoment(false);
    }
  }

  function saveMoment(saved: Moment) {
    resource.setData((current) => {
      if (!current || current.id !== saved.id || current.version > saved.version) return current;
      return { ...saved, photos: current.photos };
    });
    setModalMode(null);
  }

  function requestDeletePhoto(photo: MomentPhoto, index: number) {
    setPendingPhotoDelete({ photo, index });
    setActionError(null);
    setModalMode("deletePhoto");
  }

  if (resource.loading && !item) return <LoadingState />;
  if (!item) return <ErrorState message={resource.error || "没有找到这篇点滴"} onRetry={() => void resource.refresh()} />;

  const selectedPhotoIndexSafe = Math.min(safeSelectedIndex, Math.max(item.photos.length - 1, 0));

  const modalTitle = modalMode === "manage"
    ? "管理回忆"
    : modalMode === "edit"
      ? "编辑回忆"
      : modalMode === "photos"
        ? "管理照片"
        : modalMode === "deletePhoto"
          ? "删除照片"
          : "删除回忆";
  const modalDescription = modalMode === "manage"
    ? "编辑文字、添加照片，或整理这段回忆。"
    : modalMode === "edit"
      ? "修改标题、日期和想说的话。"
      : modalMode === "photos"
        ? "添加照片或整理已有照片。"
        : modalMode === "deletePhoto"
          ? "确认后，这张照片会从回忆中移除。"
          : modalMode === "deleteMoment"
            ? "删除这段回忆及其中的全部照片，且无法恢复。"
            : undefined;

  return (
    <div className="space-memory">
      {resource.error ? <div className="space-memory__status"><StatusMessage tone="error">同步失败：{resource.error}。继续显示上一次读取的内容。</StatusMessage></div> : null}
      <PageHeader
        eyebrow="ONE DAY, KEPT"
        title={item.title}
        description="这一页，留着那一天的照片和心情。"
        backHref="/moments"
        action={<button ref={manageButtonRef} className="button button--secondary" type="button" aria-label="管理回忆" onClick={openManager}><Ellipsis size={18} aria-hidden="true" />管理回忆</button>}
      />

      <p className="space-memory__date-line"><Camera size={16} aria-hidden="true" /><time dateTime={item.date}>{displayDate(item.date)}</time></p>

      {selectedPhoto ? (
        <section className="space-memory__gallery" aria-label="点滴照片序列">
          <LeadPhoto
            key={selectedPhoto.id}
            moment={item}
            photo={selectedPhoto}
            index={selectedPhotoIndexSafe}
            count={item.photos.length}
            onOpen={(element) => { setViewerOpener(element); setViewerPhotoId(selectedPhoto.id); }}
          />
          {item.photos.length > 1 ? (
            <>
              <div className="space-memory__actions" aria-label="浏览照片序列">
                <button className="space-gallery__icon-button" type="button" aria-label="上一张照片" onClick={() => moveSelectedPhoto(-1)}><ChevronLeft size={21} /></button>
                <button className="space-gallery__icon-button" type="button" aria-label="下一张照片" onClick={() => moveSelectedPhoto(1)}><ChevronRight size={21} /></button>
                <span className="space-gallery__count">点按缩略图切换 · 共 {item.photos.length} 张</span>
              </div>
              <div className="space-memory__sequence" aria-label="照片缩略图">
                {item.photos.map((photo, index) => (
                  <button
                    className="space-memory__thumb"
                    key={photo.id}
                    type="button"
                    aria-label={"查看照片：" + item.title + "，第 " + (index + 1) + " 张照片"}
                    aria-current={index === selectedPhotoIndexSafe}
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
        <section className="space-memory__empty-photo" aria-label="没有照片">
          <Camera size={24} aria-hidden="true" />
          <p>文字也可以把这一天留下。</p>
          <span>添加照片后，它们会在这里展开。</span>
        </section>
      )}

      <article className="space-memory__copy" aria-label="回忆正文">
        <p className="eyebrow">NOTES FROM THAT DAY</p>
        {item.body ? <p className="space-memory__body">{item.body}</p> : <p className="space-memory__no-copy">还没有写下想说的话。</p>}
        <AuditLine record={item} members={session?.home?.members} />
      </article>

      {modalMode ? (
        <Modal
          title={modalTitle}
          description={modalDescription}
          onClose={() => setModalMode(null)}
          returnFocusTo={manageButtonRef.current}
          busy={modalBusy}
        >
          {modalMode === "manage" ? (
            <div className="space-memory__manage-actions">
              <button ref={manageActionRef} className="button button--secondary" type="button" onClick={() => { setActionError(null); setModalMode("edit"); }}><Pencil size={17} aria-hidden="true" />编辑回忆</button>
              <button className="button button--secondary" type="button" onClick={openPhotoManager}><ImagePlus size={17} aria-hidden="true" />添加照片</button>
              <button className="button button--secondary" type="button" onClick={openPhotoManager}><Camera size={17} aria-hidden="true" />管理照片</button>
              <button className="button button--danger" type="button" onClick={() => { setActionError(null); setModalMode("deleteMoment"); }}><Trash2 size={17} aria-hidden="true" />删除这段回忆</button>
            </div>
          ) : null}

          {modalMode === "edit" ? (
            <div className="space-memory__edit-panel space-editor">
              <MomentEditor
                initial={item}
                onSaved={saveMoment}
                onCancel={() => setModalMode(null)}
                onSavingChange={setEditingSaving}
              />
            </div>
          ) : null}

          {modalMode === "photos" ? (
            <div className="space-memory__photo-manager">
              <button ref={photoManagerFocusRef} className="quiet-button space-memory__back-to-manager" type="button" disabled={uploading || deletingPhoto !== null} onClick={() => { setActionError(null); setModalMode("manage"); }}>返回管理回忆</button>
              <div className="space-memory__picker">
                <input ref={inputRef} id="moment-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || deletingPhoto !== null || pendingFiles.length > 0} onChange={upload} />
                <label htmlFor="moment-photos"><Upload size={21} aria-hidden="true" /><strong>选择照片</strong><span>可一次添加多张 JPEG、PNG 或 WebP</span></label>
              </div>
              <p className="space-memory__help">添加中的照片会保留在此处；上传失败后可以重试剩余照片。</p>
              {uploadStatus ? <div className="space-memory__error"><StatusMessage tone={uploadTone}>{uploadStatus}</StatusMessage></div> : null}
              {pendingFiles.length ? (
                <div className="space-memory__upload-actions">
                  <button className="button" type="button" disabled={uploading || deletingPhoto !== null} onClick={() => void uploadFiles(pendingFiles)}>{uploading ? <LoaderCircle className="spin" size={17} /> : <ImagePlus size={17} />}{uploading ? "正在重试…" : "重试剩余 " + pendingFiles.length + " 张"}</button>
                  <button className="button button--secondary" type="button" disabled={uploading || deletingPhoto !== null} onClick={() => { setPendingFiles([]); setUploadTone("neutral"); setUploadStatus("已取消剩余照片上传，可以重新选择。"); }}>取消剩余上传</button>
                </div>
              ) : null}
              {item.photos.length ? (
                <ol className="space-memory__photo-list" aria-label="照片列表">
                  {item.photos.map((photo, index) => (
                    <li className="space-memory__photo-row" key={photo.id}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl(photo.id, { variant: "thumbnail" })} alt="" loading="lazy" decoding="async" />
                      <span>第 {index + 1} 张照片</span>
                      <button className="space-memory__photo-delete" type="button" aria-label={"删除第 " + (index + 1) + " 张照片"} disabled={uploading || deletingPhoto !== null} onClick={() => requestDeletePhoto(photo, index)}><Trash2 size={17} aria-hidden="true" /><span>删除</span></button>
                    </li>
                  ))}
                </ol>
              ) : <p className="space-memory__photo-empty">这段回忆还没有照片。</p>}
              {actionError ? <StatusMessage tone="error">{actionError}</StatusMessage> : null}
            </div>
          ) : null}

          {modalMode === "deletePhoto" && pendingDeletePhoto ? (
            <div className="space-memory__delete-photo-panel">
              <div className="space-memory__delete-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(pendingDeletePhoto.id, { variant: "thumbnail" })} alt="" loading="eager" decoding="async" />
                <span>第 {currentDeleteIndex + 1} 张照片</span>
              </div>
              {actionError ? <StatusMessage tone="error">{actionError}</StatusMessage> : null}
              <div className="space-memory__delete-actions">
                <button className="button button--secondary" type="button" disabled={deletingPhoto !== null} onClick={() => { setActionError(null); setPendingPhotoDelete(null); setModalMode("photos"); }}>取消</button>
                <button ref={confirmPhotoDeleteRef} className="button button--danger" type="button" disabled={deletingPhoto !== null} onClick={() => void deletePhoto(pendingDeletePhoto).catch(() => undefined)}><Trash2 size={17} aria-hidden="true" />{deletingPhoto === pendingDeletePhoto.id ? "正在删除…" : "确认删除"}</button>
              </div>
            </div>
          ) : null}

          {modalMode === "deleteMoment" ? (
            <div className="space-memory__delete-moment-panel">
              <p>确定删除“{item.title}”吗？其中的照片也会一起删除。</p>
              {actionError ? <StatusMessage tone="error">{actionError}</StatusMessage> : null}
              <button ref={confirmMomentDeleteRef} className="button button--danger" type="button" disabled={deletingMoment} onClick={() => void removeMoment().catch(() => undefined)}><Trash2 size={17} aria-hidden="true" />{deletingMoment ? "正在删除…" : "确认删除"}</button>
            </div>
          ) : null}
        </Modal>
      ) : null}

      {viewerEntry ? (
        <PhotoViewer
          entries={viewerEntries}
          photoId={viewerEntry.photo.id}
          onSelectPhoto={selectViewerPhoto}
          onClose={closeViewer}
          returnFocusTo={viewerOpener}
        />
      ) : null}
    </div>
  );
}
