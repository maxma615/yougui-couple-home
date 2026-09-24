import crypto from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, open, rm, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export type ConfigEnvironment = Record<string, string | undefined>;

export type AppConfig = {
  databaseUrl: string;
  sessionSecret: string;
  appOrigin: string;
  attachmentsDir: string;
  maxUploadBytes: number;
  maxImagePixels: number;
  production: boolean;
};

const weakSecrets = new Set([
  "change-me",
  "changeme",
  "default-session-secret",
  "replace-with-at-least-32-random-characters",
  "12345678901234567890123456789012",
]);

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL 不能为空"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET 至少需要 32 个字符"),
  APP_ORIGIN: z.string().url("APP_ORIGIN 必须是完整 URL"),
  ATTACHMENTS_DIR: z.string().min(1, "ATTACHMENTS_DIR 不能为空"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  MAX_IMAGE_PIXELS: z.coerce.number().int().positive().default(40_000_000),
  TZ: z.literal("Asia/Shanghai").default("Asia/Shanghai"),
});

function formatConfigurationError(error: z.ZodError): Error {
  const details = error.issues
    .map((issue) => `${issue.path.join(".") || "配置"}: ${issue.message}`)
    .join("; ");
  return new Error(`配置无效：${details}`);
}

function hasPlausibleRandomness(secret: string): boolean {
  // Character classes are not an entropy measure: secure random hex has only
  // two. This catches repeated/pattern-like placeholders while accepting hex
  // and base64 output from cryptographic random generators.
  return new Set(secret).size >= 12;
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("配置无效：APP_ORIGIN 只支持 HTTP 或 HTTPS");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("配置无效：APP_ORIGIN 只能包含协议、主机和端口");
  }
  return url.origin;
}

export function loadConfig(env: ConfigEnvironment = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(env);
  if (!parsed.success) throw formatConfigurationError(parsed.error);

  const production = parsed.data.NODE_ENV === "production";
  const appOrigin = normalizeOrigin(parsed.data.APP_ORIGIN);
  const originUrl = new URL(appOrigin);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(originUrl.hostname);
  if (!path.isAbsolute(parsed.data.ATTACHMENTS_DIR)) {
    throw new Error("配置无效：ATTACHMENTS_DIR 必须是绝对路径");
  }
  if (production && originUrl.protocol !== "https:" && !loopback) {
    throw new Error("配置无效：生产环境公网 APP_ORIGIN 必须使用 HTTPS");
  }
  if (
    production &&
    (weakSecrets.has(parsed.data.SESSION_SECRET.toLowerCase()) ||
      !hasPlausibleRandomness(parsed.data.SESSION_SECRET))
  ) {
    throw new Error("配置无效：生产环境 SESSION_SECRET 必须是至少 32 位的随机值");
  }

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    sessionSecret: parsed.data.SESSION_SECRET,
    appOrigin,
    attachmentsDir: path.resolve(parsed.data.ATTACHMENTS_DIR),
    maxUploadBytes: parsed.data.MAX_UPLOAD_BYTES,
    maxImagePixels: parsed.data.MAX_IMAGE_PIXELS,
    production,
  };
}

export async function validateRuntimeConfig(config: AppConfig): Promise<void> {
  const restoring = await lstat(path.join(config.attachmentsDir, ".restore-in-progress"))
    .then(() => true)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return false;
      throw new Error("配置无效：无法检查 ATTACHMENTS_DIR 恢复状态", { cause: error });
    });
  if (restoring) {
    throw new Error("恢复尚未完成：请按运维文档检查失败原因并重新恢复到空环境，应用不会启动");
  }
  const probe = path.join(config.attachmentsDir, `.write-probe-${crypto.randomUUID()}`);
  try {
    if (config.production) {
      if (!(await stat(config.attachmentsDir)).isDirectory()) {
        throw new Error("not a directory");
      }
    } else {
      await mkdir(config.attachmentsDir, { recursive: true, mode: 0o750 });
    }
    if (!(await stat(config.attachmentsDir)).isDirectory()) {
      throw new Error("not a directory");
    }
    await access(config.attachmentsDir, constants.R_OK | constants.W_OK);
    const handle = await open(probe, "wx", 0o600);
    await handle.close();
    await rm(probe);
  } catch (error) {
    await rm(probe, { force: true }).catch(() => undefined);
    throw new Error("配置无效：ATTACHMENTS_DIR 必须存在且可写", { cause: error });
  }
}
