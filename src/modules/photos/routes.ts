import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { Pool } from "pg";

import { requireHomeMember } from "@/lib/auth-context";
import { loadConfig } from "@/lib/config";
import { pool } from "@/lib/db";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import { assertMultipartMutation, readPhotoMultipart } from "@/modules/photos/multipart";
import { createPhotoService, type PhotoLimits } from "@/modules/photos/store";

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
) {
  const service = createPhotoService(target, attachmentsDirectory);
  return {
    async GET(request: Request, route: RouteContext): Promise<Response> {
      const response = await apiRoute(async () => {
        const ctx = await requireHomeMember(request, target);
        const photo = await service.open(ctx, (await route.params).id);
        const bytes = await readRegularFileNoFollow(photo.filePath);
        const extension = photo.mime === "image/jpeg" ? "jpg" : photo.mime.slice("image/".length);
        return new Response(new Uint8Array(bytes), {
          status: 200,
          headers: {
            "Content-Type": photo.mime,
            "Content-Length": String(bytes.length),
            "Content-Disposition": `inline; filename="photo.${extension}"; filename*=UTF-8''${encodeURIComponent(photo.filename)}`,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
          },
        });
      });
      response.headers.set("Cache-Control", "private, no-store");
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
