"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, LoaderCircle, Pencil, Sparkles, Trash2, X } from "lucide-react";

import { ApiError, apiRequest, errorMessage, jsonBody } from "@/components/api-client";
import type { Moment, MomentPhoto } from "@/components/home-types";
import { AuditLine, ErrorState, LoadingState, PageHeader, StatusMessage, confirmDelete } from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { useSession } from "@/hooks/use-session";

type PhotoUploadResult = { photo: MomentPhoto; version: number };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
  const item = resource.data;

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
        current = { ...current, version: result.version, photos: [...current.photos, result.photo] };
        resource.setData(current);
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

  async function deletePhoto(photo: MomentPhoto) {
    if (!item || !window.confirm(`确定删除照片“${photo.filename}”吗？删除后无法恢复。`)) return;
    setDeletingPhoto(photo.id);
    setUploadStatus(null);
    try {
      const result = await apiRequest<{ ok: true; version: number }>(`/api/photos/${photo.id}`, {
        method: "DELETE",
        body: jsonBody({ version: item.version }),
      });
      resource.setData({ ...item, version: result.version, photos: item.photos.filter((entry) => entry.id !== photo.id) });
      setUploadTone("success");
      setUploadStatus(`照片“${photo.filename}”已删除。`);
    } catch (requestError) {
      setUploadTone("error");
      setUploadStatus(requestError instanceof ApiError && requestError.status === 409 ? "另一位成员刚刚更新了这篇点滴，已载入最新内容，请确认后再删除。" : errorMessage(requestError));
      await resource.refresh();
    } finally {
      setDeletingPhoto(null);
    }
  }

  async function removeMoment() {
    if (!item || !confirmDelete("点滴", item.title)) return;
    try {
      await apiRequest<{ ok: true }>(`/api/moments/${item.id}`, { method: "DELETE", body: jsonBody({ version: item.version }) });
      router.replace("/moments");
    } catch (requestError) {
      window.alert(errorMessage(requestError));
      void resource.refresh();
    }
  }

  if (resource.loading && !item) return <LoadingState />;
  if (!item) return <ErrorState message={resource.error || "没有找到这篇点滴"} onRetry={() => void resource.refresh()} />;

  return (
    <>
      {resource.error ? <StatusMessage tone="error">同步失败：{resource.error}。继续显示上一次读取的内容。</StatusMessage> : null}
      <PageHeader title={item.title} backHref="/moments" action={<Link className="button" href={`/moments/${item.id}/edit`}><Pencil size={17} /> 编辑文字</Link>} />
      <div className="detail-stack">
        <article className="detail-card">
          <div className="detail-heading"><div><p className="eyebrow">{item.date}</p><h2>{item.title}</h2></div><Sparkles size={30} color="var(--home-accent)" /></div>
          <p className="detail-body">{item.body}</p>
          <AuditLine record={item} members={session?.home?.members} />
        </article>

        <section className="detail-card" aria-labelledby="photos-title">
          <div className="photo-heading"><div><p className="eyebrow">共同相册</p><h2 id="photos-title">照片 {item.photos.length ? `· ${item.photos.length}` : ""}</h2></div><Camera size={25} color="var(--home-accent)" /></div>
          {item.photos.length ? (
            <div className="photo-grid">
              {item.photos.map((photo) => (
                <figure className="photo-card" key={photo.id} title={`${photo.filename} · ${formatBytes(photo.bytes)}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/photos/${photo.id}`} alt={`${item.title}：${photo.filename}`} loading="lazy" />
                  <button className="photo-card__delete" type="button" disabled={deletingPhoto === photo.id} aria-label={`删除照片：${photo.filename}`} onClick={() => void deletePhoto(photo)}>{deletingPhoto === photo.id ? <LoaderCircle className="spin" size={17} /> : <X size={18} />}</button>
                </figure>
              ))}
            </div>
          ) : <p className="muted-copy">这篇点滴还没有照片。</p>}
          <div className="upload-zone">
            <label className="field-label" htmlFor="moment-photos"><ImagePlus size={17} aria-hidden="true" /> 添加照片</label>
            <input ref={inputRef} id="moment-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || pendingFiles.length > 0} onChange={upload} />
            <p className="field-help">支持 JPEG、PNG、WebP。文件会逐张上传并检查真实图片内容。</p>
            {uploadStatus ? <StatusMessage tone={uploadTone}>{uploadStatus}</StatusMessage> : null}
            {pendingFiles.length ? (
              <div className="button-row">
                <button className="button" type="button" disabled={uploading} onClick={() => void uploadFiles(pendingFiles)}>{uploading ? <LoaderCircle className="spin" size={17} /> : <ImagePlus size={17} />}{uploading ? "正在重试…" : `重试剩余 ${pendingFiles.length} 张`}</button>
                <button className="button button--secondary" type="button" disabled={uploading} onClick={() => { setPendingFiles([]); setUploadTone("neutral"); setUploadStatus("已取消剩余照片上传，可以重新选择文件。"); }}>取消剩余上传</button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="detail-card">
          <div className="button-row">
            <Link className="button button--secondary" href={`/moments/${item.id}/edit`}><Pencil size={17} /> 编辑文字</Link>
            <button className="button button--danger" type="button" onClick={() => void removeMoment()}><Trash2 size={17} /> 删除“{item.title}”</button>
          </div>
        </section>
      </div>
    </>
  );
}
