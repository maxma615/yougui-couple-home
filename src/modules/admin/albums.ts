import type { Pool, PoolClient } from "pg";

import { requireAdmin, type AdminContext } from "@/lib/auth-context";
import { loadConfig } from "@/lib/config";
import { pool } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { apiRoute, json } from "@/lib/http";
import { requireResourceId } from "@/lib/resource-service";
import { assertAdministrator } from "@/modules/admin/service";
import { safeStoragePath } from "@/modules/photos/store";
import { servePrivatePhoto } from "@/modules/photos/response";
import { photoVariantCache, type PhotoVariantCache } from "@/modules/photos/variants";

type QueryTarget = Pool | PoolClient;
type RouteContext = { params: Promise<{ id: string }> };
export type AdminAlbumSummary = { id: string; name: string; startDate: string; memberCount: number; photoCount: number };
export type AdminAlbumEntry = {
  moment: { id: string; title: string; date: string };
  photo: { id: string; filename: string; mime: string; bytes: number };
  photoIndex: number;
};
export type AdminAlbumPage = { album: AdminAlbumSummary; entries: AdminAlbumEntry[]; nextOffset: number | null };

const summaryQuery = `SELECT h.id,h.name,h.start_date::text AS "startDate",
  (SELECT count(*)::int FROM home_members hm WHERE hm.home_id=h.id) AS "memberCount",
  (SELECT count(*)::int FROM photos p JOIN moments m ON m.id=p.moment_id AND m.home_id=p.home_id WHERE p.home_id=h.id) AS "photoCount"
  FROM homes h`;

export async function getAdminAlbums(context: AdminContext, target: QueryTarget = pool): Promise<AdminAlbumSummary[]> {
  await assertAdministrator(target, context);
  return (await target.query<AdminAlbumSummary>(summaryQuery + " ORDER BY h.created_at,h.id")).rows;
}

export async function getAdminAlbum(
  context: AdminContext, homeId: string, offsetInput: string | null, target: QueryTarget = pool,
): Promise<AdminAlbumPage> {
  await assertAdministrator(target, context);
  requireResourceId(homeId);
  const offset = Number(offsetInput ?? "0");
  if ((offsetInput !== null && !/^\d+$/.test(offsetInput)) || !Number.isSafeInteger(offset) || offset > 1_000_000) {
    throw new AppError(400, "INVALID_ALBUM_OFFSET", "相册分页参数无效");
  }
  const album = (await target.query<AdminAlbumSummary>(summaryQuery + " WHERE h.id=$1", [homeId])).rows[0];
  if (!album) throw new AppError(404, "home_not_found", "没有找到空间");
  const photos = await target.query<{
    id: string; original_filename: string; mime_type: string; bytes: string;
    moment_id: string; title: string; date: string; photo_index: number;
  }>(`SELECT p.id,p.original_filename,p.mime_type,p.byte_size::text AS bytes,
      m.id AS moment_id,m.title,m.date::text,
      (row_number() OVER(PARTITION BY p.moment_id ORDER BY p.created_at,p.id)-1)::int AS photo_index
    FROM photos p JOIN moments m ON m.id=p.moment_id AND m.home_id=p.home_id
    WHERE p.home_id=$1
    ORDER BY m.date DESC,m.created_at DESC,m.id DESC,p.created_at,p.id
    LIMIT 61 OFFSET $2`, [homeId, offset]);
  return {
    album,
    entries: photos.rows.slice(0, 60).map(row => ({
      photo: { id: row.id, filename: row.original_filename, mime: row.mime_type, bytes: Number(row.bytes) },
      moment: { id: row.moment_id, title: row.title, date: row.date },
      photoIndex: row.photo_index,
    })),
    nextOffset: photos.rows.length > 60 ? offset + 60 : null,
  };
}

export function createAdminAlbumRoutes(
  target: Pool = pool, attachmentsDirectory?: string, variants: PhotoVariantCache = photoVariantCache,
) {
  return {
    list(request: Request) {
      return apiRoute(async () => json({ albums: await getAdminAlbums(await requireAdmin(request, target), target) }));
    },
    album(request: Request, route: RouteContext) {
      return apiRoute(async () => json(await getAdminAlbum(
        await requireAdmin(request, target), (await route.params).id, new URL(request.url).searchParams.get("offset"), target,
      )));
    },
    photo(request: Request, route: RouteContext) {
      return servePrivatePhoto(request, async () => {
        const context = await requireAdmin(request, target);
        await assertAdministrator(target, context);
        const id = (await route.params).id;
        requireResourceId(id);
        const result = await target.query<{
          storage_name: string; original_filename: string; mime_type: string; byte_size: string; sha256: string;
        }>(`SELECT p.storage_name,p.original_filename,p.mime_type,p.byte_size::text,p.sha256
          FROM photos p JOIN moments m ON m.id=p.moment_id AND m.home_id=p.home_id WHERE p.id=$1`, [id]);
        const photo = result.rows[0];
        if (!photo) throw new AppError(404, "NOT_FOUND", "照片不存在");
        return {
          filePath: safeStoragePath(attachmentsDirectory ?? loadConfig().attachmentsDir, photo.storage_name),
          filename: photo.original_filename, mime: photo.mime_type, bytes: Number(photo.byte_size), sha256: photo.sha256,
        };
      }, variants);
    },
  };
}
