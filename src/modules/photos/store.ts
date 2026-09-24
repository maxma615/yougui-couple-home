import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";

import { loadConfig } from "@/lib/config";
import { pool, transaction } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { publishHomeEvent } from "@/lib/events/publisher";
import { requireResourceId, requireVersion, type ResourceContext, type ResourceRow } from "@/lib/resource-service";
import { attachPhotos } from "@/modules/moments/queries";
import type { MomentPhoto } from "@/modules/moments/schema";
import { validateImage, type ValidatedImage } from "@/modules/photos/validate";

export type PhotoUpload = {
  filename: string;
  claimedMime: string;
  data: Uint8Array;
  version: unknown;
};

export type PhotoLimits = { maxBytes: number; maxPixels: number };

type LockedMoment = ResourceRow & { title: string; date: string; body: string };
type StoredPhotoRow = {
  id: string;
  storage_name: string;
  original_filename: string;
  mime_type: ValidatedImage["mime"];
  byte_size: string;
  sha256: string;
  moment_id: string;
  version: number;
};

const STORAGE_NAME_PATTERN = /^[0-9a-f]{32}\.(jpg|png|webp)$/;

export function safeStoragePath(attachmentsDirectory: string, storageName: string): string {
  if (!STORAGE_NAME_PATTERN.test(storageName)) {
    throw new Error("Unsafe photo storage name");
  }
  return path.join(attachmentsDirectory, "photos", storageName);
}

function safeDisplayFilename(value: string): string {
  const filename = value.trim();
  if (
    filename.length < 1 ||
    filename.length > 255 ||
    filename === "." ||
    filename === ".." ||
    /[\\/\u0000-\u001f\u007f]/.test(filename)
  ) {
    throw new AppError(422, "INVALID_FILENAME", "照片文件名无效", {
      file: "文件名不能包含路径或控制字符",
    });
  }
  return filename;
}

async function ensureDirectories(attachmentsDirectory: string): Promise<{ temporary: string; photos: string }> {
  const temporary = path.join(attachmentsDirectory, "tmp");
  const photos = path.join(attachmentsDirectory, "photos");
  await mkdir(temporary, { recursive: true, mode: 0o750 });
  await mkdir(photos, { recursive: true, mode: 0o750 });
  return { temporary, photos };
}

export async function storePhoto(
  temporaryPath: string,
  image: ValidatedImage,
  attachmentsDirectory: string,
): Promise<{ storageName: string; filePath: string }> {
  await ensureDirectories(attachmentsDirectory);
  const storageName = `${randomBytes(16).toString("hex")}.${image.extension}`;
  const filePath = safeStoragePath(attachmentsDirectory, storageName);
  await rename(temporaryPath, filePath);
  return { storageName, filePath };
}

async function lockedMoment(
  tx: PoolClient,
  ctx: ResourceContext,
  momentId: string,
): Promise<LockedMoment> {
  const result = await tx.query<LockedMoment>(
    `SELECT id,version,title,date::text AS date,body,
       created_at AS "createdAt",updated_at AS "updatedAt",
       created_by AS "createdBy",updated_by AS "updatedBy"
     FROM moments WHERE home_id=$1 AND id=$2 FOR UPDATE`,
    [ctx.homeId, momentId],
  );
  const row = result.rows[0];
  if (!row) throw new AppError(404, "NOT_FOUND", "内容不存在");
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  ) as LockedMoment;
}

async function versionConflict(
  tx: PoolClient,
  ctx: ResourceContext,
  current: LockedMoment,
): Promise<never> {
  const hydrated = (await attachPhotos([current], ctx.homeId, tx))[0];
  throw new AppError(
    409,
    "VERSION_CONFLICT",
    "另一位成员已经修改了这条点滴，请刷新后重试",
    undefined,
    hydrated,
  );
}

async function registerFailedCleanup(
  tx: PoolClient,
  ctx: ResourceContext,
  photoId: string,
  storageName: string,
  image: ValidatedImage,
): Promise<void> {
  await tx.query(
    `INSERT INTO photo_cleanup_queue(storage_name,home_id,photo_id,sha256,byte_size,last_error)
     VALUES($1,$2,$3,$4,$5,'数据库写入失败后的文件回收')
     ON CONFLICT(storage_name) DO NOTHING`,
    [storageName, ctx.homeId, photoId, image.sha256, image.bytes],
  );
}

export function createPhotoService(
  target: Pool = pool,
  attachmentsDirectory?: string,
  limits?: PhotoLimits,
) {
  return {
    async upload(
      ctx: ResourceContext,
      momentId: string,
      input: PhotoUpload,
    ): Promise<{ photo: MomentPhoto; version: number }> {
      const runtimeConfig =
        attachmentsDirectory === undefined || limits === undefined ? loadConfig() : undefined;
      const runtimeAttachmentsDirectory = attachmentsDirectory ?? runtimeConfig!.attachmentsDir;
      const runtimeLimits = limits ?? {
        maxBytes: runtimeConfig!.maxUploadBytes,
        maxPixels: runtimeConfig!.maxImagePixels,
      };
      requireResourceId(momentId);
      const expectedVersion = requireVersion(input.version);
      const filename = safeDisplayFilename(input.filename);
      if (input.data.byteLength === 0) {
        throw new AppError(422, "EMPTY_IMAGE", "照片不能为空", { file: "请选择非空照片" });
      }
      if (input.data.byteLength > runtimeLimits.maxBytes) {
        throw new AppError(413, "IMAGE_TOO_LARGE", "照片超过上传大小限制", {
          file: `照片不能超过 ${runtimeLimits.maxBytes} 字节`,
        });
      }

      const directories = await ensureDirectories(runtimeAttachmentsDirectory);
      const temporaryPath = path.join(directories.temporary, `${randomUUID()}.upload`);
      const handle = await open(temporaryPath, "wx", 0o600);
      let moved: { storageName: string; filePath: string } | undefined;
      let image: ValidatedImage | undefined;
      let compensatedInsideTransaction = false;
      const photoId = randomUUID();
      try {
        await handle.writeFile(input.data);
        await handle.sync();
        await handle.close();
        const validated = await validateImage(temporaryPath, {
          claimedMime: input.claimedMime,
          maxBytes: runtimeLimits.maxBytes,
          maxPixels: runtimeLimits.maxPixels,
        });
        image = validated;

        return await transaction(async (tx) => {
          const current = await lockedMoment(tx, ctx, momentId);
          if (current.version !== expectedVersion) return versionConflict(tx, ctx, current);
          const stored = await storePhoto(temporaryPath, validated, runtimeAttachmentsDirectory);
          moved = stored;
          try {
            await tx.query(
              `INSERT INTO photos(id,home_id,moment_id,storage_name,original_filename,mime_type,byte_size,sha256,uploaded_by)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
              [
                photoId,
                ctx.homeId,
                momentId,
                stored.storageName,
                filename,
                validated.mime,
                validated.bytes,
                validated.sha256,
                ctx.userId,
              ],
            );
            const updated = await tx.query<{ version: number }>(
              `UPDATE moments SET version=version+1,updated_at=now(),updated_by=$3
               WHERE home_id=$1 AND id=$2 RETURNING version`,
              [ctx.homeId, momentId, ctx.userId],
            );
            const version = updated.rows[0].version;
            await publishHomeEvent(tx, {
              homeId: ctx.homeId,
              type: "moment",
              resourceId: momentId,
              action: "updated",
              version,
            });
            return {
              photo: {
                id: photoId,
                filename,
                mime: validated.mime,
                bytes: validated.bytes,
              },
              version,
            };
          } catch (error) {
            try {
              await rm(stored.filePath, { force: true });
              compensatedInsideTransaction = true;
            } catch {
              // The transaction must roll back first. Recovery below takes a
              // fresh shared maintenance lock before deleting or queueing it.
            }
            throw error;
          }
        }, target);
      } catch (error) {
        if (moved && image && !compensatedInsideTransaction) {
          try {
            await transaction(async (tx) => {
              const committed = await tx.query("SELECT 1 FROM photos WHERE id=$1", [photoId]);
              if (committed.rowCount) return;
              try {
                await rm(moved!.filePath, { force: true });
              } catch {
                await registerFailedCleanup(tx, ctx, photoId, moved!.storageName, image!);
              }
            }, target);
          } catch (recoveryError) {
            throw new AggregateError(
              [error, recoveryError],
              "照片数据库写入和文件补偿均失败；请运行 verify-storage",
            );
          }
        }
        throw error;
      } finally {
        await handle.close().catch(() => undefined);
        await rm(temporaryPath, { force: true }).catch(() => undefined);
      }
    },

    async open(ctx: ResourceContext, photoId: string): Promise<{
      filePath: string;
      filename: string;
      mime: ValidatedImage["mime"];
      bytes: number;
      sha256: string;
    }> {
      const runtimeAttachmentsDirectory = attachmentsDirectory ?? loadConfig().attachmentsDir;
      requireResourceId(photoId);
      const result = await target.query<StoredPhotoRow>(
        `SELECT p.id,p.storage_name,p.original_filename,p.mime_type,p.byte_size::text,p.sha256,
                p.moment_id,m.version
         FROM photos p JOIN moments m ON m.id=p.moment_id AND m.home_id=p.home_id
         WHERE p.home_id=$1 AND p.id=$2`,
        [ctx.homeId, photoId],
      );
      const row = result.rows[0];
      if (!row) throw new AppError(404, "NOT_FOUND", "照片不存在");
      return {
        filePath: safeStoragePath(runtimeAttachmentsDirectory, row.storage_name),
        filename: row.original_filename,
        mime: row.mime_type,
        bytes: Number(row.byte_size),
        sha256: row.sha256,
      };
    },

    async remove(
      ctx: ResourceContext,
      photoId: string,
      version: unknown,
    ): Promise<{ ok: true; version: number }> {
      requireResourceId(photoId);
      const expectedVersion = requireVersion(version);
      return transaction(async (tx) => {
        const found = await tx.query<StoredPhotoRow>(
          `SELECT p.id,p.storage_name,p.original_filename,p.mime_type,p.byte_size::text,p.sha256,
                  p.moment_id,m.version
           FROM photos p JOIN moments m ON m.id=p.moment_id AND m.home_id=p.home_id
           WHERE p.home_id=$1 AND p.id=$2 FOR UPDATE OF m`,
          [ctx.homeId, photoId],
        );
        const photo = found.rows[0];
        if (!photo) throw new AppError(404, "NOT_FOUND", "照片不存在");
        if (photo.version !== expectedVersion) {
          return versionConflict(tx, ctx, await lockedMoment(tx, ctx, photo.moment_id));
        }
        await tx.query(
          `INSERT INTO photo_cleanup_queue(storage_name,home_id,photo_id,sha256,byte_size)
           VALUES($1,$2,$3,$4,$5) ON CONFLICT(storage_name) DO NOTHING`,
          [photo.storage_name, ctx.homeId, photo.id, photo.sha256, photo.byte_size],
        );
        await tx.query("DELETE FROM photos WHERE home_id=$1 AND id=$2", [ctx.homeId, photoId]);
        const updated = await tx.query<{ version: number }>(
          `UPDATE moments SET version=version+1,updated_at=now(),updated_by=$3
           WHERE home_id=$1 AND id=$2 RETURNING version`,
          [ctx.homeId, photo.moment_id, ctx.userId],
        );
        const nextVersion = updated.rows[0].version;
        await publishHomeEvent(tx, {
          homeId: ctx.homeId,
          type: "moment",
          resourceId: photo.moment_id,
          action: "updated",
          version: nextVersion,
        });
        return { ok: true, version: nextVersion };
      }, target);
    },
  };
}

export const photos = createPhotoService();
