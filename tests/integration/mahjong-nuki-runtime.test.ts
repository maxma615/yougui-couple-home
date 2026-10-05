import { randomUUID } from "node:crypto";
import net from "node:net";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import { runMigrations } from "@/cli/migrate";
import { createSession, SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { runMahjongServer } from "@/modules/mahjong/server";
import { RoomStore } from "@/modules/mahjong/rooms";
import { SanmaGame } from "@/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "@/modules/mahjong/sanma-wall";
import { RiichiGame } from "@/modules/mahjong/engine";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import type { MahjongResponse } from "@/modules/mahjong/types";

let db: TestDatabase, service: Awaited<ReturnType<typeof runMahjongServer>>, address: string;
const users: string[] = [], cookies: string[] = [], sockets: Socket[] = [];
const states: MahjongResponse[][] = [[], []];
const appOrigin = "http://127.0.0.1:34445";
function physicalWall() {
  const available = sanmaTiles();
  const take = (tile: string) => { const index = available.indexOf(tile); if (index < 0) throw new Error(`Impossible fixture: ${tile}`); return available.splice(index, 1)[0]; };
  const hand = [..."123456789"].map(n => take(`p${n}`)).concat([..."123"].map(n => take(`s${n}`)), take("z2"));
  const north = take("z4"), replacement = take("z2");
  const others = available.splice(0, 26), reserve = [replacement, ...available.splice(0, 3)], indicators = available.splice(0, 10);
  return new SanmaWall([...hand, ...others, north, ...available, ...reserve, ...indicators]);
}
beforeAll(async () => {
  db = await createTestDatabase(); await runMigrations(db.pool);
  vi.stubEnv("DATABASE_URL", db.databaseUrl); vi.stubEnv("APP_ORIGIN", appOrigin);
  for (let n = 0; n < 2; n++) {
    const id = randomUUID(); users.push(id);
    await db.pool.query("INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)", [id, `nuki-${id}@example.test`, `north${n}`, "not-a-login-hash"]);
    cookies.push(`${SESSION_COOKIE_NAME}=${(await createSession(id, db.pool)).token}`);
  }
  const port = await new Promise<number>((resolve, reject) => { const server = net.createServer(); server.on("error", reject); server.listen(0, "127.0.0.1", () => { const port = (server.address() as net.AddressInfo).port; server.close(() => resolve(port)); }); });
  address = `http://127.0.0.1:${port}`;
  const rooms = new RoomStore({ gameFactory: (variant, mode, names) => variant === "sanma" ? new SanmaGame(mode, names, { dealer: 0, wallFactory: physicalWall }) : new RiichiGame(mode, names) });
  service = await runMahjongServer({ port, rooms, sweepMs: 50 });
});
afterAll(async () => { sockets.forEach(socket => socket.disconnect()); if (service) await service.close(); vi.unstubAllEnvs(); if (db) await db.cleanup(); });
async function post(n: number, body: object) {
  return fetch(`${address}/internal/room`, { method: "POST", headers: { cookie: cookies[n], origin: appOrigin, "content-type": "application/json" }, body: JSON.stringify({ nonce: randomUUID(), ...(["create", "join"].includes((body as { action: string }).action) ? {} : { roomId: service.rooms.view(users[n])?.id }), ...body }) });
}
it("extracts a physically dealt North via authenticated command and pushes both private socket views", async () => {
  const created = await (await post(0, { action: "create", mode: "east", variant: "sanma" })).json() as MahjongResponse;
  expect((await post(1, { action: "join", code: created.room!.code })).ok).toBe(true);
  expect((await post(0, { action: "fill-bots" })).ok).toBe(true);
  for (let n = 0; n < 2; n++) {
    const socket = io(address, { path: "/mahjong/socket.io", transports: ["websocket"], extraHeaders: { cookie: cookies[n], origin: appOrigin }, forceNew: true });
    socket.on("mahjong:state", state => states[n].push(state)); sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
    expect((await post(n, { action: "ready", ready: true })).ok).toBe(true);
  }
  expect((await post(0, { action: "start" })).ok).toBe(true);
  await vi.waitFor(() => expect(states.every(list => list.some(s => s.room?.status === "playing"))).toBe(true));
  const own = service.rooms.view(users[0])!.game!, other = service.rooms.view(users[1])!.game!;
  expect(own.drawnTile).toBe("z4"); expect(own.choices.some(c => c.type === "nuki")).toBe(true);
  const beforeCount = own.hand.filter(tile => tile === "z4").length;
  // The private fixture is not a production command option.
  expect((await post(0, { action: "respond", decisionId: own.decisionId, choiceId: "nuki", hand: ["z4"] })).status).toBe(400);
  expect((await post(0, { action: "respond", decisionId: own.decisionId, choiceId: "nuki" })).ok).toBe(true);
  await vi.waitFor(() => expect(states.every(list => list.some(s => s.room?.game?.players[0].nuki === 1))).toBe(true));
  const northViews = states.map(list => list.slice().reverse().find(s => s.room?.game?.players[0].nuki === 1)!.room!.game!);
  expect(northViews[0].hand.filter(tile => tile === "z4")).toHaveLength(beforeCount - 1);
  expect(northViews[0].drawnTile).toBe("z2");
  expect(northViews[0].doraIndicators).toEqual(own.doraIndicators);
  expect(northViews[1].hand).toEqual(other.hand);
  for (const view of northViews) { expect(view.players).toHaveLength(3); for (const player of view.players) expect(player).not.toHaveProperty("hand"); expect(JSON.stringify(view)).not.toMatch(/_pai|wallFactory|privateHands/); }
  expect((await post(0, { action: "finish" })).ok).toBe(true);
});
