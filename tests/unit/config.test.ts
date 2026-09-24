import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  loadConfig,
  validateRuntimeConfig,
  type ConfigEnvironment,
} from "@/lib/config";

const temporaryDirectories: string[] = [];
const testRoot = path.resolve(".local/tests/config");

async function temporaryDirectory(): Promise<string> {
  await mkdir(testRoot, { recursive: true });
  const directory = await mkdtemp(path.join(testRoot, "run-"));
  temporaryDirectories.push(directory);
  return directory;
}

function validEnvironment(overrides: Partial<ConfigEnvironment> = {}): ConfigEnvironment {
  return {
    NODE_ENV: "test",
    DATABASE_URL: "postgresql://postgres@127.0.0.1:55432/couple_home",
    SESSION_SECRET: "A4m!9qZ@1vN#8sR$3xT%6kP&2yW*7cD_",
    APP_ORIGIN: "http://127.0.0.1:3000",
    ATTACHMENTS_DIR: path.join(testRoot, "attachments"),
    TZ: "Asia/Shanghai",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("loadConfig", () => {
  it("rejects a missing session secret instead of silently using a shared default", () => {
    expect(() => loadConfig(validEnvironment({ SESSION_SECRET: undefined }))).toThrow(
      /SESSION_SECRET/,
    );
  });

  it.each(["change-me", "default-session-secret", "12345678901234567890123456789012"])(
    "rejects the production placeholder session secret %s",
    (sessionSecret) => {
      expect(() =>
        loadConfig(
          validEnvironment({
            NODE_ENV: "production",
            APP_ORIGIN: "https://home.example.test",
            SESSION_SECRET: sessionSecret,
          }),
        ),
      ).toThrow(/SESSION_SECRET/);
    },
  );

  it("rejects a non-HTTPS production origin", () => {
    expect(() =>
      loadConfig(
        validEnvironment({
          NODE_ENV: "production",
          APP_ORIGIN: "http://home.example.test",
        }),
      ),
    ).toThrow(/APP_ORIGIN/);
  });

  it("accepts a long cryptographically random hex production secret", () => {
    expect(() =>
      loadConfig(
        validEnvironment({
          NODE_ENV: "production",
          APP_ORIGIN: "https://home.example.test",
          SESSION_SECRET:
            "8f3a26d4cc4987ab6d7f90d5b392e74f2ea8c10d64f3b17c5e9ab2067d8341ef",
        }),
      ),
    ).not.toThrow();
  });

  it("allows an HTTP loopback origin for a local production build", () => {
    expect(() =>
      loadConfig(
        validEnvironment({
          NODE_ENV: "production",
          APP_ORIGIN: "http://127.0.0.1:3000",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects an origin whose protocol is neither HTTP nor HTTPS", () => {
    expect(() => loadConfig(validEnvironment({ APP_ORIGIN: "ftp://localhost" }))).toThrow(
      /APP_ORIGIN/,
    );
  });

  it("rejects a relative attachment directory", () => {
    expect(() => loadConfig(validEnvironment({ ATTACHMENTS_DIR: "./uploads" }))).toThrow(
      /ATTACHMENTS_DIR/,
    );
  });

  it("loads numeric limits and safe defaults", () => {
    const config = loadConfig(
      validEnvironment({
        MAX_UPLOAD_BYTES: "2048",
        MAX_IMAGE_PIXELS: "4096",
      }),
    );

    expect(config).toMatchObject({
      maxUploadBytes: 2048,
      maxImagePixels: 4096,
      production: false,
    });
  });
});

describe("validateRuntimeConfig", () => {
  it("creates an absent absolute attachment directory and verifies it is writable", async () => {
    const parent = await temporaryDirectory();
    const attachmentsDir = path.join(parent, "attachments");

    await validateRuntimeConfig(loadConfig(validEnvironment({ ATTACHMENTS_DIR: attachmentsDir })));

    await expect(access(attachmentsDir)).resolves.toBeUndefined();
  });

  it("rejects an attachment path that is a file", async () => {
    const parent = await temporaryDirectory();
    const attachmentsDir = path.join(parent, "not-a-directory");
    await writeFile(attachmentsDir, "occupied");

    await expect(
      validateRuntimeConfig(loadConfig(validEnvironment({ ATTACHMENTS_DIR: attachmentsDir }))),
    ).rejects.toThrow(/ATTACHMENTS_DIR/);
  });

  it("rejects a missing production attachment directory instead of creating storage silently", async () => {
    const parent = await temporaryDirectory();
    const attachmentsDir = path.join(parent, "missing-production-volume");
    const config = loadConfig(
      validEnvironment({
        NODE_ENV: "production",
        APP_ORIGIN: "https://home.example.test",
        ATTACHMENTS_DIR: attachmentsDir,
      }),
    );

    await expect(validateRuntimeConfig(config)).rejects.toThrow(/ATTACHMENTS_DIR/);
  });

  it("refuses to start a partially restored environment and preserves its marker", async () => {
    const attachmentsDir = await temporaryDirectory();
    const marker = path.join(attachmentsDir, ".restore-in-progress");
    await writeFile(marker, JSON.stringify({ state: "failed" }));

    await expect(
      validateRuntimeConfig(loadConfig(validEnvironment({ ATTACHMENTS_DIR: attachmentsDir }))),
    ).rejects.toThrow(/恢复尚未完成/);
    await expect(access(marker)).resolves.toBeUndefined();
  });
});
