import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import sharp from "sharp";

import { requireHomeMember } from "@/lib/auth-context";
import { loadConfig } from "@/lib/config";
import { pool } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import { assertMultipartMutation, readPhotoMultipart } from "@/modules/photos/multipart";
import { createPhotoService, type PhotoLimits } from "@/modules/photos/store";
import { photoVariantCache, type PhotoVariantCache } from "@/modules/photos/variants";

type RouteContext = { params: Promise<{ id: string }> };

async function readRegularFileNoFollow(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await handle.stat()).isFile()) throw new Error("Photo storage entry is not a regular file");
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

export function createMomentPhotoRoutes(
  target: Pool = pool,
  attachmentsDirectory?: string,
  limits?: PhotoLimits,
) {
  return {
    POST(request: Request, route: RouteContext): Promise<Response> {
      return apiRoute(async () => {
        const config = loadConfig();
        const runtimeLimits = limits ?? {
          maxBytes: config.maxUploadBytes,
          maxPixels: config.maxImagePixels,
        };
        const service = createPhotoService(
          target,
          attachmentsDirectory ?? config.attachmentsDir,
          runtimeLimits,
        );
        const boundary = assertMultipartMutation(request, config.appOrigin, runtimeLimits.maxBytes);
        const ctx = await requireHomeMember(request, target);
        const input = await readPhotoMultipart(request, boundary, runtimeLimits.maxBytes);
        return json(await service.upload(ctx, (await route.params).id, input), { status: 201 });
      });
    },
  };
}

export function createPhotoItemRoutes(
  target: Pool = pool,
  attachmentsDirectory?: string,
  variants: PhotoVariantCache = photoVariantCache,
) {
  const service = createPhotoService(target, attachmentsDirectory);
  return {
    async GET(request: Request, route: RouteContext): Promise<Response> {
      const response = await apiRoute(async () => {
        const ctx = await requireHomeMember(request, target);
        const photo = await service.open(ctx, (await route.params).id);
        const url = new URL(request.url);
        const requestedVariant = url.searchParams.get("variant");
        const variant = requestedVariant === null ? "original" : requestedVariant;
        if (variant !== "original" && variant !== "thumbnail" && variant !== "preview") {
          throw new AppError(400, "INVALID_PHOTO_VARIANT", "照片尺寸参数无效");
        }

        const recipe = variant === "thumbnail" ? "webp-v1-w640-q76" :
          variant === "preview" ? "webp-v1-w1280-q80" : "original-v1";
        const etag = `"${createHash("sha256").update(`${photo.sha256}\0${recipe}`).digest("hex")}"`;
        const contentType = variant === "original" ? photo.mime : "image/webp";
        const headers = new Headers({
          "Content-Type": contentType,
          "Content-Disposition": variant === "original"
            ? `inline; filename="photo.${photo.mime === "image/jpeg" ? "jpg" : photo.mime.slice("image/".length)}"; filename*=UTF-8''${encodeURIComponent(photo.filename)}`
            : `inline; filename="photo-${variant}.webp"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-cache, must-revalidate",
          "Vary": "Cookie",
          ETag: etag,
        });

        if (matchesIfNoneMatch(request.headers.get("if-none-match"), etag)) {
          return new Response(null, { status: 304, headers });
        }

        if (variant === "original") {
          const bytes = await readRegularFileNoFollow(photo.filePath);
          headers.set("Content-Length", String(bytes.length));
          return new Response(new Uint8Array(bytes), { status: 200, headers });
        }

        const maxEdge = variant === "thumbnail" ? 640 : 1280;
        const quality = variant === "thumbnail" ? 76 : 80;
        const bytes = await variants.getOrCreate(etag, async () => {
          const original = await readRegularFileNoFollow(photo.filePath);
          return sharp(original, { failOn: "error", limitInputPixels: 40_000_000 })
            .rotate()
            .resize({
              width: maxEdge,
              height: maxEdge,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality, effort: 4 })
            .toBuffer();
        });
        headers.set("Content-Length", String(bytes.length));
        return new Response(new Uint8Array(bytes), { status: 200, headers });
      });
      if (response.status === 200 || response.status === 304) {
        response.headers.set("Cache-Control", "private, no-cache, must-revalidate");
        response.headers.set("Vary", "Cookie");
      }
      return response;
    },
    DELETE(request: Request, route: RouteContext): Promise<Response> {
      return apiRoute(async () => {
        assertJsonMutation(request, loadConfig().appOrigin);
        const ctx = await requireHomeMember(request, target);
        const body = (await readJson(request)) as { version?: unknown };
        return json(await service.remove(ctx, (await route.params).id, body?.version));
      });
    },
  };
}

function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (!header) return false;
  return header.split(",").some((candidate) => {
    const value = candidate.trim();
    return value === "*" || value.replace(/^W\//, "") === etag;
  });
}
