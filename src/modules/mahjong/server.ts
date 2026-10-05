import { createServer, type IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { Pool } from "pg";
import { Server } from "socket.io";
import { loadConfig } from "@/lib/config";
import { appErrorResponse } from "@/lib/errors";
import { assertJsonMutation, readJson } from "@/lib/http";
import { RateLimiter } from "@/lib/security";
import { requireMahjongPlayer } from "./auth";
import { BotRunner } from "./bot-runner";
import { RoomStore, ROOM_IDLE_MS } from "./rooms";
import type { MahjongResponse } from "./types";

function asRequest(message: IncomingMessage, origin: string): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(message.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(",") : value);
  return new Request(new URL(message.url ?? "/", origin), {
    headers, method: message.method ?? "GET",
    ...(message.method === "POST" ? { body: Readable.toWeb(message) as ReadableStream<Uint8Array>, duplex: "half" } : {}),
  } as RequestInit);
}

export async function runMahjongServer(options: { port: number; idleMs?: number; sweepMs?: number; host?: string; botDelayMs?: number } ) {
  const config = loadConfig();
  const database = new Pool({ connectionString: config.databaseUrl, max: 2 });
  const rooms = new RoomStore();
  const limits = new RateLimiter();
  let lastRoomActivity = Date.now();
  let shuttingDown = false;
  let pushing = false;
  let pushAgain = false;
  const instanceId = randomUUID();
  const responseFor = (userId: string): MahjongResponse => ({ room: rooms.view(userId), serviceRunning: true });
  const http = createServer(async (message, output) => {
    let response: Response;
    try {
      const request = asRequest(message, config.appOrigin);
      if (new URL(request.url).pathname === "/internal/health" && request.method === "GET") {
        response = Response.json({ kind: "yougui-mahjong", origin: config.appOrigin, instanceId });
      } else if (new URL(request.url).pathname === "/internal/room" && ["GET", "POST"].includes(request.method)) {
        const player = await requireMahjongPlayer(request, database);
        if (request.method === "POST") {
          assertJsonMutation(request, config.appOrigin);
          const body = await readJson(request);
          limits.consume(`move:${player.userId}`, 180, 60_000, Date.now());
          if ((body as { action?: string }).action === "join" || (body as { action?: string }).action === "create") limits.consume(`lobby:${player.userId}`, 10, 60_000, Date.now());
          rooms.execute(player, body as Parameters<RoomStore["execute"]>[1]);
          lastRoomActivity = Date.now();
          void push();
        }
        response = Response.json(responseFor(player.userId));
      } else response = Response.json({ error: { code: "not_found", message: "接口不存在" } }, { status: 404 });
    } catch (error) { response = appErrorResponse(error); }
    output.writeHead(response.status, { "content-type": "application/json", "cache-control": "no-store" });
    output.end(await response.text());
  });
  const io = new Server(http, {
    path: "/mahjong/socket.io", addTrailingSlash: false, maxHttpBufferSize: 4096, serveClient: false,
    allowRequest: (request, accept) => accept(null, !request.headers.origin || request.headers.origin === config.appOrigin),
  });

  io.use(async (socket, next) => {
    try {
      const player = await requireMahjongPlayer(asRequest(socket.request, config.appOrigin), database);
      const active = [...io.sockets.sockets.values()].filter(s => s.data.userId === player.userId).length;
      if (active >= 8) throw new Error("connection limit");
      socket.data.userId = player.userId;
      next();
    } catch { next(new Error("登录已失效或账号不能参与对局")); }
  });

  async function push() {
    if (shuttingDown) return;
    if (pushing) { pushAgain = true; return; }
    pushing = true;
    try {
      for (const socket of io.sockets.sockets.values()) {
        try {
          const player = await requireMahjongPlayer(asRequest(socket.request, config.appOrigin), database);
          const payload = responseFor(player.userId);
          const encoded = JSON.stringify(payload);
          if (encoded !== socket.data.lastState) { socket.data.lastState = encoded; socket.emit("mahjong:state", payload); }
        } catch {
          socket.emit("mahjong:error", { code: "authentication_required", message: "登录已失效，请重新登录" });
          socket.disconnect(true);
        }
      }
    } finally {
      pushing = false;
      if (pushAgain) { pushAgain = false; void push(); }
    }
  }
  const bots = new BotRunner(rooms, { visualDelayMs: options.botDelayMs, onChange: () => { void push(); } });
  io.on("connection", socket => {
    rooms.connection(socket.data.userId, 1);
    socket.on("disconnect", () => { rooms.connection(socket.data.userId, -1); void push(); });
    void push();
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port, options.host ?? (config.production ? "0.0.0.0" : "127.0.0.1"), resolve);
  });
  const idleMs = options.idleMs ?? ROOM_IDLE_MS;
  const parentPid = Number(process.env.MAHJONG_PARENT_PID ?? 0);
  const timer = setInterval(() => {
    const oldSize = rooms.size;
    rooms.sweep();
    if (oldSize > 0 && rooms.size === 0) lastRoomActivity = Date.now();
    if (rooms.size > 0) lastRoomActivity = Date.now();
    void push();
    if (rooms.size === 0 && Date.now() - lastRoomActivity >= idleMs) void close();
    if (parentPid) { try { process.kill(parentPid, 0); } catch { void close(); } }
  }, options.sweepMs ?? 5000);

  async function close() {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(timer);
    await bots.close();
    await new Promise<void>(resolve => io.close(() => resolve()));
    await database.end();
  }
  return { close, io, rooms, bots };
}
