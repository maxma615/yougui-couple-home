import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import net from "node:net";
import path from "node:path";
import { createTestDatabase } from "../tests/helpers/database";
import { runMigrations } from "../src/cli/migrate";
import { initializeAdmin } from "../src/modules/auth/service";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

async function stop(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null || server.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => server.kill("SIGKILL"), 5_000);
    server.once("exit", () => { clearTimeout(timer); resolve(); });
    server.kill("SIGTERM");
  });
}

async function main(): Promise<void> {
  await access(".next/BUILD_ID");
  await mkdir(".local/persistence", { recursive: true });
  const database = await createTestDatabase();
  const directory = await mkdtemp(path.resolve(".local/persistence/run-"));
  const attachmentsDir = path.join(directory, "attachments");
  await mkdir(attachmentsDir);
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const password = randomBytes(24).toString("base64url");
  const environment: NodeJS.ProcessEnv = {
    ...process.env, NODE_ENV: "production", DATABASE_URL: database.databaseUrl,
    SESSION_SECRET: randomBytes(48).toString("base64url"), APP_ORIGIN: origin,
    ATTACHMENTS_DIR: attachmentsDir, NEXT_TELEMETRY_DISABLED: "1",
  };
  const log = createWriteStream(path.join(directory, "server.log"), { mode: 0o600 });
  let server: ChildProcess | undefined;
  let cookie = "";
  const start = async () => {
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env: environment, stdio: ["ignore", "pipe", "pipe"] });
    server = child;
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error("Production server exited; inspect .local/persistence server log");
      try { if ((await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1_000) })).ok) return; } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error("Production server startup timed out");
  };
  const request = async (route: string, method = "GET", body?: unknown) => {
    const response = await fetch(`${origin}/api/${route}`, {
      method, headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert(response.ok, `${method} ${route}: ${response.status}`);
    return response;
  };
  try {
    await runMigrations(database.pool);
    await initializeAdmin({ email: "restart@example.test", displayName: "重启验证", password }, database.pool);
    await start();
    const loggedIn = await request("auth/login", "POST", { email: "restart@example.test", password });
    assert.match(loggedIn.headers.get("set-cookie") ?? "", /Secure/);
    cookie = loggedIn.headers.get("set-cookie")!.split(";", 1)[0];
    await request("home", "POST", { name: "持久化测试小屋", startDate: "2020-05-20", displayName: "重启验证" });
    const saved: Array<{ route: string; value: Record<string, unknown> }> = [];
    for (const [route, body] of [
      ["anniversaries", { title: "相识纪念日", date: "2020-05-20", yearly: true }],
      ["todos", { title: "重启后继续买花", description: "保存后重启进程", completed: false }],
      ["moments", { title: "重启后的照片", date: "2026-09-22", body: "数据库与文件都要留下" }],
      ["calendar", { title: "跨月旅行", start: "2026-09-30", end: "2026-10-02", allDay: true, location: "海边", description: "全天日期保留" }],
      ["calendar", { title: "秋日约会", start: "2026-11-01T01:30:00-04:00", end: "2026-11-01T01:15:00-05:00", allDay: false, location: "公园", description: "带偏移的真实时刻" }],
    ] as const) {
      const value = await (await request(route, "POST", body)).json();
      saved.push({ route, value });
    }
    const moment = saved[2].value;
    let version = 1;
    const photos: Array<{ id: string; hash: string }> = [];
    for (const [name, mime] of [["valid.jpg", "image/jpeg"], ["valid.png", "image/png"], ["valid.webp", "image/webp"]]) {
      const bytes = await readFile(path.resolve("tests/fixtures/images", name));
      const form = new FormData();
      form.set("file", new File([bytes], name, { type: mime }));
      form.set("version", String(version));
      const response = await fetch(`${origin}/api/moments/${moment.id}/photos`, { method: "POST", headers: { Origin: origin, Cookie: cookie }, body: form });
      assert.equal(response.status, 201);
      const result = await response.json();
      version = result.version;
      photos.push({ id: result.photo.id, hash: createHash("sha256").update(bytes).digest("hex") });
    }
    moment.version = version;
    await stop(server!);
    await start();
    assert.equal((await (await request("session")).json()).home.name, "持久化测试小屋");
    for (const { route, value } of saved) {
      const restored = await (await request(`${route}/${value.id}`)).json();
      assert.equal(restored.title, value.title);
      assert.equal(restored.version, value.version);
      for (const field of ["start", "end", "allDay", "location", "description", "createdBy", "updatedBy"]) {
        if (field in value) assert.equal(restored[field], value[field]);
      }
    }
    // Require a fresh login as well as persistence of the prior server session.
    await request("auth/logout", "POST", {});
    cookie = "";
    const relogin = await request("auth/login", "POST", { email: "restart@example.test", password });
    cookie = relogin.headers.get("set-cookie")!.split(";", 1)[0];
    for (const photo of photos) {
      const downloaded = await request(`photos/${photo.id}`);
      assert.equal(createHash("sha256").update(Buffer.from(await downloaded.arrayBuffer())).digest("hex"), photo.hash);
    }
    console.log("PASS: production restart preserved home, all resource types including both calendar variants, session, versions and audit members; fresh login read all JPEG/PNG/WebP photos with identical SHA-256.");
  } finally {
    if (server) await stop(server);
    log.end();
    await database.cleanup();
    await rm(attachmentsDir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Persistence test failed"); process.exitCode = 1; });
