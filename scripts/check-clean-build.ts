import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import path from "node:path";

async function main() {
  const root = process.cwd();
  await mkdir(".local/clean-build", { recursive: true });
  const directory = await mkdtemp(path.resolve(".local/clean-build/run-"));
  try {
    for (const entry of ["src", "db", "package.json", "package-lock.json", "tsconfig.json", "next-env.d.ts", "next.config.ts"]) {
      await cp(path.join(root, entry), path.join(directory, entry), { recursive: true });
    }
    await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" };
    for (const name of ["DATABASE_URL", "SESSION_SECRET", "APP_ORIGIN", "ATTACHMENTS_DIR", "INIT_ADMIN_PASSWORD", "RESET_PASSWORD"]) delete env[name];
    const build = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], { cwd: directory, env, stdio: "inherit" });
    const code = await new Promise<number>((resolve, reject) => {
      build.once("error", reject);
      build.once("exit", value => resolve(value ?? 1));
    });
    if (code !== 0) throw new Error("Build without runtime secrets failed");
    console.log("PASS: a fresh source copy builds without environment files, database URL, runtime secrets or attachment configuration.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Clean build failed"); process.exitCode = 1; });
