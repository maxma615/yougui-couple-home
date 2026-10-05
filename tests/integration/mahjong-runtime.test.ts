import { randomUUID } from "node:crypto";
import net from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import { runMigrations } from "@/cli/migrate";
import { createSession, SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { runMahjongServer } from "@/modules/mahjong/server";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import type { MahjongResponse } from "@/modules/mahjong/types";

async function freePort(): Promise<number> { return new Promise((resolve,reject) => { const server=net.createServer(); server.on("error",reject); server.listen(0,"127.0.0.1",() => { const port=(server.address() as net.AddressInfo).port; server.close(() => resolve(port)); }); }); }
describe("authenticated volatile runtime", () => {
  let db: TestDatabase, service: Awaited<ReturnType<typeof runMahjongServer>>, address: string;
  const cookies: string[] = [], users: string[] = [], sockets: Socket[] = [];
  const appOrigin = "http://127.0.0.1:34444";
  beforeAll(async () => {
    db = await createTestDatabase();
    await runMigrations(db.pool);
    vi.stubEnv("DATABASE_URL", db.databaseUrl);
    vi.stubEnv("APP_ORIGIN", appOrigin);
    for (let n = 0; n < 6; n++) {
      const id = randomUUID(); users.push(id);
      await db.pool.query("INSERT INTO users(id,email,display_name,password_hash,role) VALUES($1,$2,$3,$4,$5)", [id, `qa-${id}@example.test`, `player${n}`, "not-a-login-hash", n === 5 ? "admin" : "member"]);
      const session = await createSession(id, db.pool);
      cookies.push(`${SESSION_COOKIE_NAME}=${session.token}`);
    }
    const port = await freePort(); address=`http://127.0.0.1:${port}`;
    service = await runMahjongServer({ port, sweepMs: 50 });
  });
  afterAll(async () => { sockets.forEach(s => s.disconnect()); if(service)await service.close(); vi.unstubAllEnvs(); if(db)await db.cleanup(); });
  const get = (n: number) => fetch(`${address}/internal/room`, { headers: { cookie: cookies[n] } });
  const post = (n: number, body: object) => fetch(`${address}/internal/room`, { method: "POST", headers: { cookie: cookies[n], origin: appOrigin, "content-type": "application/json" }, body: JSON.stringify({ nonce: randomUUID(), ...(["create","join"].includes((body as {action:string}).action) ? {} : {roomId:service.rooms.view(users[n])?.id}), ...body }) });

  it("rejects anonymous, administrator and foreign-origin mutations", async () => {
    expect((await fetch(`${address}/internal/room`)).status).toBe(401);
    expect((await get(5)).status).toBe(403);
    expect((await fetch(`${address}/internal/room`, { method:"POST", headers:{cookie:cookies[0],origin:"https://evil.example","content-type":"application/json"},body:JSON.stringify({action:"create",mode:"east",nonce:randomUUID()}) })).status).toBe(403);
    expect(service.rooms.size).toBe(0);
  });
  it("joins four identities and pushes separate private views; a revoked session is disconnected", async () => {
    const created = await (await post(0,{action:"create",mode:"east"})).json() as MahjongResponse;
    for(let n=1;n<4;n++) expect((await post(n,{action:"join",code:created.room!.code})).ok).toBe(true);
    expect((await post(4,{action:"join",code:created.room!.code})).status).toBe(409);
    const messages: MahjongResponse[][] = [[],[],[],[]];
    for(let n=0;n<4;n++) {
      const socket=io(address,{path:"/mahjong/socket.io",transports:["websocket"],extraHeaders:{cookie:cookies[n],origin:appOrigin},forceNew:true});
      socket.on("mahjong:state",v=>messages[n].push(v)); sockets.push(socket);
      await new Promise<void>((resolve,reject)=>{socket.once("connect",resolve);socket.once("connect_error",reject);});
    }
    for(let n=0;n<4;n++) await post(n,{action:"ready",ready:true});
    expect((await post(0,{action:"start"})).ok).toBe(true);
    await vi.waitFor(()=>expect(messages.every(m=>m.some(v=>v.room?.status==="playing"))).toBe(true),{timeout:5000});
    const views=await Promise.all([0,1,2,3].map(async n => (await (await get(n)).json() as MahjongResponse).room!));
    expect(views.map(v=>v.game!.hand.length).sort()).toEqual([13,13,13,14]);
    for(const room of views) {
      expect(room.members).toHaveLength(4);
      for(const player of room.game!.players) expect(player).not.toHaveProperty("hand");
      expect(JSON.stringify(room)).not.toContain("_pai");
    }
    const actor=views[0].game!.turnSeat, game=views[actor].game!, choice=game.choices.find(c=>c.type==="discard")!;
    const body={action:"respond",decisionId:game.decisionId,choiceId:choice.id,nonce:randomUUID()};
    expect((await post(actor,body)).ok).toBe(true);
    expect((await post(actor,body)).ok).toBe(true);
    const current=(await (await get(actor)).json() as MahjongResponse).room!;
    expect(current.game!.players.find(p=>p.seat===actor)!.discards).toHaveLength(1);
    const lost = new Promise<void>(resolve=>sockets[2].once("disconnect",()=>resolve()));
    await db.pool.query("DELETE FROM sessions WHERE user_id=$1",[users[2]]);
    await lost;
    expect((await get(2)).status).toBe(401);
    expect(service.rooms.view(users[2])).not.toBeNull(); // seat survives short disconnection
    expect((await post(0,{action:"finish"})).ok).toBe(true);
    expect(service.rooms.size).toBe(0);
  });
  it("exits when there are no rooms and restarts with no previous table", async () => {
    await service.close();
    const port = await freePort(); address=`http://127.0.0.1:${port}`;
    service = await runMahjongServer({port,idleMs:100,sweepMs:20});
    expect((await (await get(0)).json() as MahjongResponse).room).toBeNull();
    await vi.waitFor(async()=>{await expect(fetch(`${address}/internal/health`)).rejects.toThrow();},{timeout:3000});
  });
});
