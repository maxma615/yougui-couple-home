import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

const execFileAsync = promisify(execFile);
const runtimeConfigKeys = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "APP_ORIGIN",
  "ATTACHMENTS_DIR",
  "MAX_UPLOAD_BYTES",
  "MAX_IMAGE_PIXELS",
  "TZ",
] as const;

function environmentWithoutRuntimeConfig(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of runtimeConfigKeys) delete environment[key];
  return environment;
}

describe("photo runtime configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("imports the photo store in a clean build environment", async () => {
    await expect(
      execFileAsync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          'await import("./src/modules/photos/store.ts")',
        ],
        {
          cwd: path.resolve("."),
          env: environmentWithoutRuntimeConfig(),
          timeout: 10_000,
        },
      ),
    ).resolves.toMatchObject({ stderr: "" });
  });

  it("constructs route and service factories before runtime config is present", async () => {
    for (const key of runtimeConfigKeys) vi.stubEnv(key, "");
    vi.resetModules();

    const [
      { createPhotoService },
      { createMomentPhotoRoutes, createPhotoItemRoutes },
      uploadRoute,
      itemRoute,
    ] = await Promise.all([
      import("../../src/modules/photos/store"),
      import("../../src/modules/photos/routes"),
      import("../../src/app/api/moments/[id]/photos/route"),
      import("../../src/app/api/photos/[id]/route"),
    ]);

    expect(() => createPhotoService()).not.toThrow();
    expect(() => createMomentPhotoRoutes()).not.toThrow();
    expect(() => createPhotoItemRoutes()).not.toThrow();
    expect(uploadRoute.POST).toBeTypeOf("function");
    expect(itemRoute.GET).toBeTypeOf("function");
    expect(itemRoute.DELETE).toBeTypeOf("function");
  });
});
