import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";

import { AppError } from "@/lib/errors";
import { apiRoute } from "@/lib/http";
import { photoVariantCache, type PhotoVariantCache } from "@/modules/photos/variants";

export type ReadablePhoto = { filePath: string; filename: string; mime: string; bytes: number; sha256: string };

async function readRegularFile(filePath: string): Promise<Buffer> {
  const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!(await file.stat()).isFile()) throw new Error("Photo storage entry is not a regular file");
    return await file.readFile();
  } finally { await file.close(); }
}

/** The resolver must authorize every request before a cache validator is evaluated. */
export async function servePrivatePhoto(
  request: Request,
  resolveAuthorizedPhoto: () => Promise<ReadablePhoto>,
  variants: PhotoVariantCache = photoVariantCache,
): Promise<Response> {
  const response = await apiRoute(async () => {
    const photo = await resolveAuthorizedPhoto();
    const variant = new URL(request.url).searchParams.get("variant") ?? "original";
    if (variant !== "original" && variant !== "thumbnail" && variant !== "preview") {
      throw new AppError(400, "INVALID_PHOTO_VARIANT", "照片尺寸参数无效");
    }
    const recipe = variant === "thumbnail" ? "webp-v1-w640-q76" : variant === "preview" ? "webp-v1-w1280-q80" : "original-v1";
    const etag = `"${createHash("sha256").update(`${photo.sha256}\0${recipe}`).digest("hex")}"`;
    const headers = new Headers({
      "Content-Type": variant === "original" ? photo.mime : "image/webp",
      "Content-Disposition": variant === "original"
        ? `inline; filename="photo.${photo.mime === "image/jpeg" ? "jpg" : photo.mime.slice("image/".length)}"; filename*=UTF-8''${encodeURIComponent(photo.filename)}`
        : `inline; filename="photo-${variant}.webp"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache, must-revalidate",
      Vary: "Cookie", ETag: etag,
    });
    const matches = request.headers.get("if-none-match")?.split(",").some(candidate => {
      const value = candidate.trim();
      return value === "*" || value.replace(/^W\//, "") === etag;
    });
    if (matches) return new Response(null, { status: 304, headers });
    const bytes = variant === "original" ? await readRegularFile(photo.filePath) : await variants.getOrCreate(etag, async () => {
      const edge = variant === "thumbnail" ? 640 : 1280;
      return sharp(await readRegularFile(photo.filePath), { failOn: "error", limitInputPixels: 40_000_000 })
        .rotate().resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
        .webp({ quality: variant === "thumbnail" ? 76 : 80, effort: 4 }).toBuffer();
    });
    headers.set("Content-Length", String(bytes.length));
    return new Response(new Uint8Array(bytes), { status: 200, headers });
  });
  if (response.status === 200 || response.status === 304) {
    response.headers.set("Cache-Control", "private, no-cache, must-revalidate");
    response.headers.set("Vary", "Cookie");
  }
  return response;
}
