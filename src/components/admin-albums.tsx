"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Images, ImageOff, LoaderCircle, RefreshCw, UsersRound } from "lucide-react";

import { apiRequest, errorMessage } from "@/components/api-client";
import { PhotoViewer } from "@/components/photo-viewer";
import { photoUrl } from "@/components/photo-url";
import type { AdminAlbumEntry, AdminAlbumPage, AdminAlbumSummary } from "@/modules/admin/albums";

function adminPhotoUrl(id: string, options: Parameters<typeof photoUrl>[1] = {}) {
  return photoUrl(id, options).replace("/api/photos/", "/api/admin/photos/");
}

export function AdminAlbums() {
  const [albums, setAlbums] = useState<AdminAlbumSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const [selected, setSelected] = useState<AdminAlbumSummary | null>(null);
  const [page, setPage] = useState<AdminAlbumPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);
  const requestRef = useRef<{ generation: number; controller: AbortController | null }>({ generation: 0, controller: null });
  const busyRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true);
    setListError(null);
    void apiRequest<{ albums: AdminAlbumSummary[] }>("/api/admin/albums", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setAlbums(data.albums); })
      .catch(problem => { if (!controller.signal.aborted) setListError(errorMessage(problem)); })
      .finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [listVersion]);

  useEffect(() => () => { requestRef.current.controller?.abort(); }, []);

  async function loadAlbum(album: AdminAlbumSummary, offset = 0) {
    if (offset && busyRef.current) return;
    requestRef.current.controller?.abort();
    const controller = new AbortController();
    const generation = ++requestRef.current.generation;
    requestRef.current.controller = controller;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    if (!offset) {
      setSelected(album);
      setPage(null);
      setPhotoId(null);
    }
    try {
      const result = await apiRequest<AdminAlbumPage>(`/api/admin/albums/${encodeURIComponent(album.id)}?offset=${offset}`, { signal: controller.signal });
      if (generation !== requestRef.current.generation) return;
      setSelected(result.album);
      setAlbums(previous => previous.map(value => value.id === result.album.id ? result.album : value));
      setPage(previous => offset && previous?.album.id === result.album.id
        ? { ...result, entries: [...new Map([...previous.entries, ...result.entries].map(entry => [entry.photo.id, entry])).values()] }
        : result);
    } catch (problem) {
      if (!controller.signal.aborted && generation === requestRef.current.generation) setError(errorMessage(problem));
    } finally {
      if (generation === requestRef.current.generation) {
        busyRef.current = false;
        setLoading(false);
      }
    }
  }

  function closeAlbum() {
    requestRef.current.controller?.abort();
    requestRef.current.generation++;
    busyRef.current = false;
    setLoading(false);
    setSelected(null);
    setPage(null);
    setError(null);
    setPhotoId(null);
  }

  return <section id="admin-space-albums" className="admin-spaces" aria-labelledby="admin-albums-title">
    <div className="admin-section-heading">
      <div><p className="admin-kicker">空间</p><h2 id="admin-albums-title">空间相册</h2><p>按空间查看照片，点击照片打开大图。</p></div>
      <button className="admin-button admin-button--secondary" type="button" disabled={listLoading} onClick={() => { setListVersion(value => value + 1); if (selected) void loadAlbum(selected); }}>
        {listLoading ? <LoaderCircle className="admin-spin" size={16} /> : <RefreshCw size={16} />}刷新相册
      </button>
    </div>
    {listError ? <p className="admin-error" role="alert">{listError}</p> : null}
    {albums.length ? <div className="admin-space-list">{albums.map(album => <article className="admin-space admin-space--album" key={album.id}>
      <div><h3>{album.name}</h3><p>共同开始于 {album.startDate}</p></div>
      <div className="admin-album-summary"><span className="admin-space__count"><UsersRound size={16} />{album.memberCount} / 2</span><span><Images size={16} />{album.photoCount} 张</span>
        <button className="admin-button admin-button--secondary" type="button" aria-label={`查看${album.name}相册`} aria-pressed={selected?.id === album.id} onClick={() => void loadAlbum(album)}>查看相册</button>
      </div>
    </article>)}</div> : <div className="admin-space-empty" role="status">{listLoading ? "正在读取空间相册…" : listError ? "相册列表暂时不可用。" : "还没有创建情侣空间。"}</div>}

    {selected ? <div className="admin-album" aria-label={`${selected.name}的相册`}>
      <div className="admin-section-heading admin-album__heading"><div><p className="admin-kicker">{selected.photoCount} 张照片</p><h3>{selected.name}</h3></div>
        <button className="admin-button admin-button--quiet" type="button" onClick={closeAlbum}><ChevronLeft size={16} />返回空间列表</button>
      </div>
      {error ? <div className="admin-inline-error" role="alert">{error}<button className="admin-text-button" type="button" onClick={() => void loadAlbum(selected, page?.nextOffset ?? 0)}>再试一次</button></div> : null}
      {page?.entries.length ? <div className="admin-album__grid">{page.entries.map(entry => <AlbumTile key={entry.photo.id} entry={entry} onOpen={element => { setReturnFocusTo(element); setPhotoId(entry.photo.id); }} />)}</div> : null}
      {loading ? <div className="admin-empty-state" role="status"><LoaderCircle className="admin-spin" size={20} />正在读取照片…</div> : !error && page?.entries.length === 0 ? <div className="admin-empty-state"><Images size={21} />这个空间还没有照片。</div> : null}
      {page?.nextOffset !== null && page && !loading && !error ? <button className="admin-button admin-button--secondary admin-album__more" type="button" onClick={() => void loadAlbum(selected, page.nextOffset!)}>加载更多照片</button> : null}
      {page?.entries.length ? <p className="admin-album__progress">已显示 {page.entries.length} / {page.album.photoCount} 张</p> : null}
    </div> : null}
    {photoId && page?.entries.some(entry => entry.photo.id === photoId) ? <PhotoViewer entries={page.entries} photoId={photoId} onSelectPhoto={setPhotoId} onClose={() => setPhotoId(null)} returnFocusTo={returnFocusTo} resolvePhotoUrl={adminPhotoUrl} /> : null}
  </section>;
}

function AlbumTile({ entry, onOpen }: { entry: AdminAlbumEntry; onOpen: (element: HTMLElement) => void }) {
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const description = `${entry.moment.title}第${entry.photoIndex + 1}张照片`;
  return <article className="admin-album-card">
    <button className="admin-album-card__photo" type="button" aria-label={failed ? `重试${description}` : `打开${description}`} onClick={event => {
      if (failed) { setFailed(false); setRetry(value => value + 1); } else onOpen(event.currentTarget);
    }}>
      {failed ? <span className="admin-album-card__broken"><ImageOff size={22} />照片加载失败，点击重试</span> : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={adminPhotoUrl(entry.photo.id, { variant: "thumbnail", retry })} alt={description} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      )}
    </button>
    <div className="admin-album-card__caption"><strong>{entry.moment.title}</strong><time dateTime={entry.moment.date}>{entry.moment.date}</time></div>
  </article>;
}
