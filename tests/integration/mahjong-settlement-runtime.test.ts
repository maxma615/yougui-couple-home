import { randomUUID } from "node:crypto";
import net from "node:net";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import { runMigrations } from "@/cli/migrate";
import { createSession, SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { runMahjongServer } from "@/modules/mahjong/server";
import { RoomStore } from "@/modules/mahjong/rooms";
import { physicalEngine } from "../fixtures/mahjong-settlement-game";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import type { GameVariant, MahjongResponse, RoomView } from "@/modules/mahjong/types";

let db: TestDatabase, service: Awaited<ReturnType<typeof runMahjongServer>>, address: string;
let single = false;
const users: string[] = [], cookies: string[] = [], sockets: Socket[] = [];
const origin = "http://127.0.0.1:34447";
beforeAll(async () => {
  db = await createTestDatabase(); await runMigrations(db.pool);
  vi.stubEnv("DATABASE_URL",db.databaseUrl);vi.stubEnv("APP_ORIGIN",origin);
  for(let n=0;n<5;n++) {
    const id=randomUUID();users.push(id);
    await db.pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,`result-${id}@example.test`,`玩家${n}`,"not-a-login-hash"]);
    cookies.push(`${SESSION_COOKIE_NAME}=${(await createSession(id,db.pool)).token}`);
  }
  const port=await new Promise<number>((resolve,reject)=>{const socket=net.createServer();socket.on('error',reject);socket.listen(0,'127.0.0.1',()=>{const p=(socket.address() as net.AddressInfo).port;socket.close(()=>resolve(p));});});
  address=`http://127.0.0.1:${port}`;
  const rooms=new RoomStore({gameFactory:variant=>physicalEngine(variant,single?{0:"p123456789s123z2"}:{1:"p123456789s123z2",2:"p123456789s123z2"},"z2")});
  service=await runMahjongServer({port,rooms,sweepMs:30,botDelayMs:0});
});
afterEach(async()=>{ if(service?.rooms.view(users[0])) await post(0,{action:"finish"}); });
afterAll(async()=>{sockets.forEach(s=>s.disconnect());if(service)await service.close();vi.unstubAllEnvs();if(db)await db.cleanup();});
async function post(seat:number,body:object){return fetch(`${address}/internal/room`,{method:'POST',headers:{cookie:cookies[seat],origin,'content-type':'application/json'},body:JSON.stringify({nonce:randomUUID(),...(['create','join'].includes((body as {action:string}).action)?{}:{roomId:service.rooms.view(users[seat])?.id}),...body})});}
async function connect(seat:number){
  const states:MahjongResponse[]=[];
  const socket=io(address,{path:'/mahjong/socket.io',transports:['websocket'],extraHeaders:{cookie:cookies[seat],origin},forceNew:true});sockets.push(socket);
  socket.on('mahjong:state',state=>{states.push(state);if(states.length>100)states.shift();});
  await new Promise<void>((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
  return {socket,states};
}
const view=(seat=0)=>service.rooms.view(users[seat])!;
async function choose(seat:number,type:string,value?:string){const g=view(seat).game!,c=g.choices.find(c=>c.type===type&&(value===undefined||c.value===value));expect(c).toBeDefined();const response=await post(seat,{action:'respond',decisionId:g.decisionId,choiceId:c!.id});expect(response.status).toBe(200);return (await response.json() as MahjongResponse).room!;}
async function create(variant:GameVariant,humans:number){
  const response=await post(0,{action:'create',variant,mode:'east'});expect(response.status).toBe(200);
  const created=(await response.json() as MahjongResponse).room!;
  for(let n=1;n<humans;n++)expect((await post(n,{action:'join',code:created.code})).ok).toBe(true);
  if(humans===1)expect((await post(0,{action:'fill-bots'})).ok).toBe(true);
  for(let n=0;n<humans;n++)expect((await post(n,{action:'ready',ready:true})).ok).toBe(true);
  expect((await post(0,{action:'start'})).ok).toBe(true);
  return created;
}
it.each(['sanma','yonma'] as const)('pushes private %s multi-ron pages and one net score stage across reconnect and duplicate-client ACKs',async variant=>{
  single=false;const count=variant==='sanma'?3:4;
  const clients=await Promise.all(Array.from({length:count},(_,s)=>connect(s)));
  const duplicate=await connect(0);
  try {
    const room=await create(variant,count),handId=view().game!.handId,old=view().game!.players.map(p=>p.score);
    await choose(0,'discard','z2_');const hands=Array.from({length:count},(_,s)=>view(s).game!.hand.slice());
    await choose(1,'ron');await choose(2,'ron');
    const first=view().game!,decision=first.decisionId;
    expect(first.settlementFlow).toMatchObject({stage:'detail',detailIndex:0,detailCount:2});
    await vi.waitFor(()=>expect(clients.every(c=>c.states.some(s=>s.room?.game?.decisionId===decision))).toBe(true));
    for(let s=0;s<count;s++) {
      const pushed=clients[s].states.find(p=>p.room?.game?.decisionId===decision)!.room!.game!;
      expect(pushed.hand).toEqual(hands[s]);expect(pushed.handId).toBe(handId);
      expect(pushed.players.every(p=>!('hand' in p)&&!('drawnTile' in p))).toBe(true);
      expect(pushed.players.map(p=>p.score)).toEqual(old);
    }
    const forbidden=await post(4,{action:'respond',roomId:room.id,decisionId:decision,choiceId:'ack'});expect(forbidden.status).toBe(409);expect((await forbidden.json()).error.code).toBe('seat_required');expect(view().game!.decisionId).toBe(decision);
    await choose(0,'ack');
    const repeat=await post(0,{action:'respond',decisionId:decision,choiceId:'ack'});expect(repeat.status).toBe(409);
    expect(view().game!.settlementFlow?.detailIndex).toBe(1);
    expect(view(1).game!.settlementFlow?.detailIndex).toBe(0);
    clients[1].socket.disconnect();
    const fetched=await fetch(`${address}/internal/room`,{headers:{cookie:cookies[1]}});
    const restored=(await fetched.json() as MahjongResponse).room!;expect(restored.game!.decisionId).toBe(decision);expect(restored.game!.hand).toEqual(hands[1]);
    const reconnected=await connect(1);clients[1]=reconnected;
    await choose(1,'ack');await choose(2,'ack');if(count===4)await choose(3,'ack');
    expect(view().game!.settlementFlow?.detailIndex).toBe(1);expect(view().game!.players.map(p=>p.score)).toEqual(old);
    expect((await post(1,{action:'respond',decisionId:decision,choiceId:'ack'})).status).toBe(409);
    for(let s=0;s<count;s++)await choose(s,'ack');
    const scores=view().game!;expect(scores.settlementFlow?.stage).toBe('scores');
    const next=scores.settlementFlow!.newScores;expect(scores.settlementFlow!.delta).toEqual(count===3?[-5200,2600,2600]:[-5200,2600,2600,0]);
    await vi.waitFor(()=>expect(clients.every(c=>c.states.some(s=>s.room?.game?.decisionId===scores.decisionId))).toBe(true));
    await vi.waitFor(()=>expect(duplicate.states.some(s=>s.room?.game?.decisionId===scores.decisionId)).toBe(true));
    for(let s=0;s<count;s++)await choose(s,'ack');
    await vi.waitFor(()=>expect(clients.every(c=>c.states.some(s=>s.room?.game?.handId===handId!+1))).toBe(true));
    expect(view().game!.players.slice().sort((a,b)=>a.seat-b.seat).map(p=>p.score)).toEqual(next);expect(view().game!.settlementFlow).toBeUndefined();
    expect((await post(0,{action:'finish'})).status).toBe(200);
    await vi.waitFor(()=>expect(clients.every(c=>c.states.at(-1)?.room===null)).toBe(true));
  }finally{clients.forEach(c=>c.socket.disconnect());duplicate.socket.disconnect();}
});
it.each(['sanma','yonma'] as const)('lets real bounded bots ACK each %s result stage without advancing past the human',async variant=>{
  single=true;const human=await connect(0);
  try {
    await create(variant,1);const old=view().game!.players.map(p=>p.score),handId=view().game!.handId;
    await choose(0,'tsumo');const first=view().game!;
    await vi.waitFor(()=>expect(service.rooms.botDecisions()).toEqual([]));
    expect(view().game!.settlementFlow?.stage).toBe('detail');expect(view().game!.players.map(p=>p.score)).toEqual(old);
    await choose(0,'ack');
    await vi.waitFor(()=>expect(service.rooms.botDecisions()).toEqual([]));
    expect(view().game!.settlementFlow?.stage).toBe('scores');expect(view().game!.ranking).toBeNull();
    const expected=view().game!.settlementFlow!.newScores;
    await choose(0,'ack');expect(view().game!.handId).toBe(handId!+1);expect(view().game!.players.slice().sort((a,b)=>a.seat-b.seat).map(p=>p.score)).toEqual(expected);
    expect(first.settlement?.winMethod).toBe('tsumo');expect((await post(0,{action:'finish'})).status).toBe(200);
  }finally{human.socket.disconnect();}
});
