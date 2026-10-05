import { spawn } from "node:child_process";
import path from "node:path";
import { AppError } from "@/lib/errors";
import { loadConfig } from "@/lib/config";

type ProcessRegistry = { starting?: Promise<void> };
const registry = globalThis as typeof globalThis & { youguiMahjong?: ProcessRegistry };
const state = registry.youguiMahjong ??= {};

export function mahjongPort(): number {
  const port = Number(process.env.MAHJONG_PORT ?? 3100);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid MAHJONG_PORT");
  return port;
}
export function mahjongInternalOrigin() { return `http://127.0.0.1:${mahjongPort()}`; }

export async function mahjongRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${mahjongInternalOrigin()}/internal/health`, { signal: AbortSignal.timeout(500), cache: "no-store" });
    if (!response.ok) return false;
    const value = await response.json();
    return value.kind === "yougui-mahjong" && value.origin === loadConfig().appOrigin;
  } catch { return false; }
}

export async function wakeMahjong(): Promise<void> {
  if (await mahjongRunning()) return;
  if (state.starting) return state.starting;
  state.starting = (async () => {
    if (await mahjongRunning()) return;
    // A child process in the existing app container: no Docker socket, sudo,
    // extra service or persistent game volume is needed.
    const child = spawn(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), path.resolve("src/cli/mahjong.ts")], {
      cwd: process.cwd(), env: { ...process.env, MAHJONG_PORT: String(mahjongPort()), MAHJONG_PARENT_PID: String(process.pid) },
      stdio: "ignore",
    });
    child.on("error", () => { /* The bounded readiness loop reports a safe error. */ });
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (await mahjongRunning()) return;
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    child.kill("SIGTERM");
    throw new AppError(503, "mahjong_start_failed", "麻将服务暂时未能启动，请稍后重试");
  })();
  try { await state.starting; } finally { delete state.starting; }
}

export async function proxyMahjong(request: Request, body?: unknown): Promise<Response> {
  try {
    const response = await fetch(`${mahjongInternalOrigin()}/internal/room`, {
      method: body === undefined ? "GET" : "POST", cache: "no-store", signal: AbortSignal.timeout(10_000),
      headers: { cookie: request.headers.get("cookie") ?? "", origin: loadConfig().appOrigin, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return new Response(await response.text(), { status: response.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch { throw new AppError(503, "mahjong_unavailable", "麻将服务正在退出或暂时断开，请刷新牌桌"); }
}
