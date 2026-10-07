import type { Pool } from "pg";

import { requireHomeMember } from "@/lib/auth-context";
import { loadConfig } from "@/lib/config";
import { pool } from "@/lib/db";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import { assertMultipartMutation, readPhotoMultipart } from "@/modules/photos/multipart";
import { createPhotoService, type PhotoLimits } from "@/modules/photos/store";
import { photoVariantCache, type PhotoVariantCache } from "@/modules/photos/variants";
import { servePrivatePhoto } from "@/modules/photos/response";

type RouteContext = { params: Promise<{ id: string }> };

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
    GET(request: Request, route: RouteContext): Promise<Response> {
      return servePrivatePhoto(request, async () => {
        const ctx = await requireHomeMember(request, target);
        return service.open(ctx, (await route.params).id);
      }, variants);
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
