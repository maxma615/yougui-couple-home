import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export function postgresEnvironment(databaseUrl: string): NodeJS.ProcessEnv {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use postgresql://");
  }
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: url.hostname.replace(/^\[(.*)\]$/, "$1"),
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
    PGAPPNAME: "couple-home-maintenance",
  };
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) environment.PGSSLMODE = sslMode;
  return environment;
}

export async function resolvePgTool(
  name: "pg_dump" | "pg_restore",
  override?: string,
): Promise<string> {
  if (override) return override;
  const bundled = path.resolve(process.cwd(), ".local/postgres/bin", name);
  try {
    await access(bundled, constants.X_OK);
    return bundled;
  } catch {
    return name;
  }
}

export async function runProcess(
  executable: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      env: environment,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else {
        const detail = stderr.trim().replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database]");
        reject(
          new Error(
            `${path.basename(executable)} failed (${signal ? `signal ${signal}` : `exit ${code}`}): ${detail || "no diagnostic output"}`,
          ),
        );
      }
    });
  });
}
