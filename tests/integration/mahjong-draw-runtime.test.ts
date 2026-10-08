import { randomUUID } from "node:crypto";
import net from "node:net";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { io, type Socket } from "socket.io-client";
import { runMigrations } from "@/cli/migrate";
import { createSession, SESSION_COOKIE_NAME } from "@/modules/auth/session";
import { runMahjongServer } from "@/modules/mahjong/server";
import { RoomStore } from "@/modules/mahjong/rooms";
import { physicalEngine } from "../fixtures/mahjong-settlement-game";
import { drawEngine, playToDraw } from "../fixtures/mahjong-draw-game";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import type { GameVariant, MahjongResponse, RoomView } from "@/modules/mahjong/types";

let db: TestDatabase, service: Awaited<ReturnType<typeof runMahjongServer>>, address: string;
let drawEnding: "exhaustive" | "nagashi" | "abort" | "final" = "exhaustive";
const users: string[] = [], cookies: string[] = [], sockets: Socket[] = [];
const origin = "http://127.0.0.1:34447";
beforeAll(async () => {
  db = await createTestDatabase(); await runMigrations(db.pool);
  vi.stubEnv("DATABASE_URL",db.databaseUrl);vi.stubEnv("APP_ORIGIN",origin);
  for(let n=0;n<5;n++) {
    const id=randomUUID();users.push(id);
    await db.pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,`draw-${id}@example.test`,`玩家${n}`,"not-a-login-hash"]);
    cookies.push(`${SESSION_COOKIE_NAME}=${(await createSession(id,db.pool)).token}`);
  }
  const port=await new Promise<number>((resolve,reject)=>{const socket=net.createServer();socket.on('error',reject);socket.listen(0,'127.0.0.1',()=>{const p=(socket.address() as net.AddressInfo).port;socket.close(()=>resolve(p));});});
  address=`http://127.0.0.1:${port}`;
  const rooms=new RoomStore({gameFactory:variant=>{
      const raw=drawEnding==='abort'?physicalEngine(variant,{0:'m19p19s19z1234567'},'z1'):drawEngine(variant,drawEnding==='nagashi'?[0,1]:[],drawEnding==='final'?{hands:['m19p369s369z14577','m19p147s258z13566','m19p258s147z23477','m2346p3468s2468z3']}:{});
      if(drawEnding==='abort') {const v=raw.view(0);raw.respond(0,v.decisionId,v.choices.find(c=>c.type==='abort')!.id);}
      else playToDraw(raw,variant==='sanma'?3:4);
      return raw;
  }});
  service=await runMahjongServer({port,rooms,sweepMs:30,botDelayMs:0});
});
afterEach(async()=>{ if(service?.rooms.view(users[0])) await post(0,{action:"finish"}); drawEnding='exhaustive'; });
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
it.each(['sanma','yonma'] as const)('pushes real %s public draw metadata to every authenticated viewer and preserves independent ACKs',async variant=>{
  drawEnding='exhaustive';const count=variant==='sanma'?3:4;
  const clients=await Promise.all(Array.from({length:count},(_,seat)=>connect(seat))),duplicate=await connect(0);
  try {
    const room=await create(variant,count),first=view().game!,old=first.players.map(p=>p.score),handId=first.handId;
    expect(first.settlementFlow?.stage).toBe('draw');
    expect(first.settlement?.drawInfo).toMatchObject({kind:'exhaustive',revealedHands:[{seat:0,waits:['z2']}],nagashiResults:[]});
    await vi.waitFor(()=>expect(clients.every(c=>c.states.some(s=>s.room?.game?.decisionId===first.decisionId))).toBe(true));
    for(let seat=0;seat<count;seat++) {
      const pushed=clients[seat].states.find(s=>s.room?.game?.decisionId===first.decisionId)!.room!.game!;
      expect(pushed.hand).toEqual(view(seat).game!.hand);
      expect(pushed.players.every(p=>!('hand' in p)&&!('drawnTile' in p))).toBe(true);
      expect(pushed.settlement?.drawInfo?.revealedHands.map(h=>h.seat)).toEqual([0]);
    }
    expect((await post(4,{action:'respond',roomId:room.id,decisionId:first.decisionId,choiceId:'ack'})).status).toBe(409);
    await choose(0,'ack');expect(view().game!.settlementFlow?.stage).toBe('scores');expect(view(1).game!.settlementFlow?.stage).toBe('draw');
    expect((await post(0,{action:'respond',decisionId:first.decisionId,choiceId:'ack'})).status).toBe(409);
    await vi.waitFor(()=>expect(duplicate.states.some(s=>s.room?.game?.settlementFlow?.stage==='scores')).toBe(true));
    clients[1].socket.disconnect();
    const restored=await fetch(`${address}/internal/room`,{headers:{cookie:cookies[1]}});
    expect((await restored.json() as MahjongResponse).room!.game!.decisionId).toBe(first.decisionId);
    clients[1]=await connect(1);
    const expected=view().game!.settlementFlow!.newScores.slice();
    await choose(0,'ack');expect(view().game!.handId).toBe(handId);expect(view().game!.players.map(p=>p.score)).toEqual(old);
    for(let seat=1;seat<count;seat++){await choose(seat,'ack');await choose(seat,'ack');}
    expect(view().game!.handId).toBe(handId!+1);
    expect(view().game!.players.slice().sort((a,b)=>a.seat-b.seat).map(p=>p.score)).toEqual(expected);
    expect((await post(0,{action:'finish'})).status).toBe(200);
    await vi.waitFor(()=>expect(clients.every(c=>c.states.at(-1)?.room===null)).toBe(true));
  }finally {clients.forEach(c=>c.socket.disconnect());duplicate.socket.disconnect();}
});
for(const kind of ['exhaustive','nagashi','abort'] as const) it.each(['sanma','yonma'] as const)(`real bounded %s bots finish ${kind} pages while the human retains every confirmation`,async variant=>{
  drawEnding=kind;const human=await connect(0),count=variant==='sanma'?3:4;
  try {
    const completed=service.bots.metrics.completed;
    await create(variant,1);const first=view().game!,old=first.players.map(p=>p.score),handId=first.handId;
    const pages=kind==='abort'?['draw']:kind==='nagashi'?['draw','detail','detail','scores']:['draw','scores'];
    await vi.waitFor(()=>expect(service.rooms.botDecisions()).toEqual([]),{timeout:5000});
    expect(service.bots.metrics.completed-completed).toBe((count-1)*pages.length);
    expect(service.bots.metrics.peakWorkers).toBeLessThanOrEqual(1);
    expect(service.bots.metrics.unexpectedErrors).toBe(0);
    const expected=first.settlementFlow!.newScores.slice();
    for(const stage of pages) {
      expect(view().game!.settlementFlow?.stage).toBe(stage);
      expect(view().game!.players.map(p=>p.score)).toEqual(old);
      expect(view().game!.handId).toBe(handId);expect(view().game!.ranking).toBeNull();
      await choose(0,'ack');
    }
    expect(view().game!.handId).toBe(handId!+1);
    expect(view().game!.players.slice().sort((a,b)=>a.seat-b.seat).map(p=>p.score)).toEqual(expected);
    expect((await post(0,{action:'finish'})).status).toBe(200);
    await vi.waitFor(()=>expect(human.states.at(-1)?.room===null).toBe(true));
  }finally {human.socket.disconnect();}
});

it.each(['sanma','yonma'] as const)('publishes %s final ranking only after the last authenticated ACK and restores its clock',async variant=>{
 drawEnding='final';const count=variant==='sanma'?3:4,client=await connect(0);
 try {
  const room=await create(variant,count);
  // Setup remains a real native game with legal choices; only the final
  // boundary traverses HTTP, avoiding thousands of irrelevant rate-limit calls.
  for(let step=0;step<3000;step++) {
   const current=view().game!;
   if(current.roundNumber===count && current.settlementFlow?.stage==='scores')break;
   let acted=false;
   for(let seat=0;seat<count;seat++) {
    const g=view(seat).game!;
    const c=g.choices.find(c=>c.type==='ack')??g.choices.find(c=>c.type==='pass')??g.choices.find(c=>c.type==='discard'&&c.value?.endsWith('_'));
    if(c){service.rooms.execute({userId:users[seat],displayName:`玩家${seat}`},{nonce:randomUUID(),action:'respond',roomId:room.id,decisionId:g.decisionId,choiceId:c.id});acted=true;break;}
   }
   expect(acted).toBe(true);
  }
  expect(view().game!.roundNumber).toBe(count);expect(view().game!.settlementFlow?.stage).toBe('scores');
  for(let seat=0;seat<count-1;seat++) {
   if(view(seat).game!.settlementFlow?.stage==='draw')await choose(seat,'ack');
   await choose(seat,'ack');expect(view().game!.rankingFlow).toBeUndefined();
  }
  if(view(count-1).game!.settlementFlow?.stage==='draw')await choose(count-1,'ack');
  const final=await choose(count-1,'ack');expect(final.status).toBe('finished');
  expect(final.game!.rankingFlow?.id).toBe(final.game!.gameInstanceId);
  await vi.waitFor(()=>expect(client.states.at(-1)?.room?.game?.rankingFlow?.id).toBe(final.game!.gameInstanceId));
  client.socket.disconnect();
  const restored=await fetch(`${address}/internal/room`,{headers:{cookie:cookies[0]}});
  const payload=(await restored.json() as MahjongResponse).room!;
  expect(payload.game!.ranking).toEqual(final.game!.ranking);
  expect(payload.game!.rankingFlow!.elapsedMs).toBeGreaterThanOrEqual(final.game!.rankingFlow!.elapsedMs);
  expect((await post(1,{action:'rematch'})).status).toBe(403);
  expect((await post(0,{action:'rematch'})).status).toBe(200);expect(view().game).toBeNull();
 }finally{client.socket.disconnect();}
});
