// Real engine settlements rendered through GameRoom + the production Mahjong CSS.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {createHash} from "node:crypto";
import { build } from "esbuild";
import { chromium, webkit, type Page } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SettlementSequenceGame } from "../../src/modules/mahjong/settlement-sequence";
import { confirmationAt } from "../../src/components/mahjong/settlement-presentation";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { GameVariant, GameView, RoomView, Settlement } from "../../src/modules/mahjong/types";

type Fixture = { create: () => E; name: string; variant: GameVariant; game: GameView; settlement: Settlement; room: RoomView; closed: string[]; melds: string[][]; winningTile: string; title: string };
const out=`.local/audit/task3-browser-${process.env.SETTLEMENT_STAGE || "green"}-${Date.now()}`;
mkdirSync(out,{recursive:true});
const names = ["甲", "乙", "丙", "丁"];
const viewports = [{ width: 667, height: 375 }, { width: 844, height: 390 }, { width: 1440, height: 810 }];
const tiles = (encoded: string) => [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));

function sanmaWall(hands: Record<number, string>, draws: string[]) {
  const physical = sanmaTiles(), available = physical.slice();
  const take = (tile: string) => {
    const index = available.indexOf(tile);
    assert.ok(index >= 0, `physical Sanma fixture is missing ${tile}`);
    return available.splice(index, 1)[0];
  };
  const dealt = Array.from({ length: 3 }, (_, seat) => hands[seat] ? tiles(hands[seat]).map(take) : []);
  const drawn = draws.map(take);
  for (const hand of dealt) if (!hand.length) hand.push(...available.splice(0, 13));
  assert.deepEqual(dealt.map(hand => hand.length), [13, 13, 13], "Sanma starts with three physical thirteen-tile hands");
  const reserve = available.splice(0, 4), indicators = available.splice(0, 10);
  const ordered = [...dealt.flat(), ...drawn, ...available, ...reserve, ...indicators];
  assert.deepEqual(ordered.slice().sort(), physical.slice().sort(), "Sanma wall conserves every physical tile, including red fives");
  return new SanmaWall(ordered);
}

function riichiWall(hand: string, drawnTile: string) {
  return { dealer: 0, wallFactory: (rule: ConstructorParameters<typeof Majiang.Shan>[0]) => {
    const wall = new Majiang.Shan(rule), physical = wall._pai.slice(), available = wall._pai.slice().sort();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      assert.ok(index >= 0, `physical Riichi fixture is missing ${tile}`);
      return available.splice(index, 1)[0];
    };
    const dealt = Array.from({ length: 4 }, () => [] as string[]);
    dealt[0] = tiles(hand).map(take);
    const draw = take(drawnTile);
    for (let seat = 1; seat < 4; seat++) dealt[seat] = available.splice(0, 13);
    assert.deepEqual(dealt.map(value => value.length), [13, 13, 13, 13]);
    wall._pai = [...available, ...[...dealt.flat(), draw].reverse()];
    assert.deepEqual(wall._pai.slice().sort(), physical.slice().sort(), "Riichi wall conserves all physical tiles, including red fives");
    wall._baopai = [wall._pai[4]];
    wall._fubaopai = [wall._pai[9]];
    return wall;
  } };
}

function room(game: GameView, variant: GameVariant, ownSeat: number, name: string): RoomView {
  const capacity = variant === "sanma" ? 3 : 4;
  return {
    id: `settlement-${name}`, code: "ABCDEFGH", hostUserId: `user-${ownSeat}`, variant, mode: "east", status: "playing", version: 1, mySeat: ownSeat,
    game,
    members: names.slice(0, capacity).map((displayName, seat) => ({ userId: `user-${seat}`, displayName, seat, kind: seat === ownSeat ? "human" : "bot", ready: true, connected: true })),
  };
}

function assertSettlement(settlement: Settlement, method: "ron" | "tsumo", tile: string) {
  assert.equal(settlement.kind, "win");
  assert.equal(settlement.winMethod, method);
  assert.equal(settlement.winningTile, tile);
  const [encodedClosed = "", ...encodedMelds] = (settlement.hand ?? "").split(",");
  const melds = encodedMelds.map(tiles);
  const closed = tiles(encodedClosed);
  // Yonma's engine encoding includes its tsumo tile. Sanma keeps the winning
  // tile out of the concealed encoding, including when the winner has a meld.
  if (closed.length === 14 - melds.length * 3) {
    const index = closed.lastIndexOf(tile);
    assert.ok(index >= 0, "the real drawn winning tile must be present in the Riichi concealed hand");
    closed.splice(index, 1);
  }
  assert.equal(closed.length, 13 - melds.length * 3);
  return { closed, melds };
}

function openSanmaRon(): Fixture {
  const factory = () => new SanmaGame("east", names.slice(0, 3), { dealer: 0, wallFactory: () => sanmaWall({
    0: "m1p123s456z234567", 1: "z11p123s123456z56", 2: "m119p246s246z2346",
  }, ["z1", "z5"]) });
  const game = remember(factory);
  const opening = game.view(0), east = opening.choices.find(choice => choice.type === "discard" && choice.value === "z1_");
  assert.ok(east, "dealer has a real legal East discard Choice");
  act(game, 0, east.id);
  const response = game.view(1), pon = response.choices.find(choice => choice.type === "pon" && choice.value === "z111-");
  assert.ok(pon, "seat 1 has a legal East pon Choice");
  act(game, 1, pon.id);
  assert.deepEqual(game.view(1).players.find(player => player.seat === 1)?.melds, ["z111-"], "the open group must come from the real engine state");
  const caller = game.view(1), discard = caller.choices.find(choice => choice.type === "discard" && choice.value === "z6");
  assert.ok(discard, "the caller has a real legal post-pon discard Choice");
  act(game, 1, discard.id);
  const next = game.view(2), discardDraw = next.choices.find(choice => choice.type === "discard" && choice.value === "z5_");
  assert.ok(discardDraw, "seat 2 physically draws z5 and has a legal discard Choice");
  act(game, 2, discardDraw.id);
  const winner = game.view(1), ron = winner.choices.find(choice => choice.type === "ron");
  assert.ok(ron, "the open hand has a legal ron Choice");
  act(game, 1, ron.id);
  const view = game.view(1), settlement = view.settlement!;
  assert.equal(settlement.hand?.split(",").length, 2, "the settlement must preserve its actual meld encoding");
  assert.equal(settlement.hand?.split(",")[1], "z111-");
  const parts = assertSettlement(settlement, "ron", "z5");
  assert.deepEqual(parts.melds, [["z1", "z1", "z1"]]);
  return { create: capture(game), name: "sanma-open-ron", variant: "sanma", game: view, settlement, room: room(view, "sanma", 1, "open-ron"), ...parts, winningTile: "z5", title: "荣和" };
}

function riichiTsumo(): Fixture {
  const game = remember(() => new RiichiGame("east", names, riichiWall("m123p123s123z1112", "z2")));
  const turn = game.view(0), tsumo = turn.choices.find(choice => choice.type === "tsumo");
  assert.equal(turn.drawnTile, "z2", "the winning tile must be the real wall draw");
  assert.ok(tsumo, "the real engine provides a legal tsumo Choice");
  act(game, 0, tsumo.id);
  const view = game.view(0), settlement = view.settlement!;
  const parts = assertSettlement(settlement, "tsumo", "z2");
  return { create: capture(game), name: "riichi-tsumo", variant: "yonma", game: view, settlement, room: room(view, "yonma", 0, "tsumo"), ...parts, winningTile: "z2", title: "自摸" };
}

const parse=(s:string)=>[...s.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>m[1]+n));
const ready='p123456s123z5552';
type E=RiichiGame|SanmaGame;
function rawMake(variant:'yonma'|'sanma',hands:Record<number,string>,draws:string[]):E {
 const count=variant==='yonma'?4:3;
 const build=(physical:string[])=>{
  const pool=physical.slice().sort(),take=(t:string)=>{const i=pool.indexOf(t);assert.ok(i>=0,`unavailable physical tile ${t}`);return pool.splice(i,1)[0]};
  const dealt=Array.from({length:count},(_,seat)=>hands[seat]?parse(hands[seat]).map(take):[]);
  const drawn=draws.map(take),indicators=['m1','m1'].map(take);
  for(const hand of dealt){if(!hand.length)hand.push(...pool.splice(0,13));assert.equal(hand.length,13)}
  return {pool,dealt,drawn,indicators};
 };
 if(variant==='sanma')return new SanmaGame('east',['A','B','C'],{dealer:0,wallFactory:()=>{
  const physical=sanmaTiles(),{pool,dealt,drawn,indicators}=build(physical),reserve=pool.splice(0,4);
  indicators.push(...pool.splice(0,8));const wall=[...dealt.flat(),...drawn,...pool,...reserve,...indicators];
  assert.deepEqual(wall.slice().sort(),physical.slice().sort());return new SanmaWall(wall);
 }});
 return new RiichiGame('east',['A','B','C','D'],{dealer:0,wallFactory:rule=>{
  const wall=new Majiang.Shan(rule),physical=wall._pai.slice(),{pool,dealt,drawn,indicators}=build(physical);
  // Official library indicator offsets 4/9 of the remaining wall. Reserve exact non-dora faces there.
  pool.splice(4,0,indicators[0]);pool.splice(9,0,indicators[1]);
  wall._pai=[...pool,...[...dealt.flat(),...drawn].reverse()];wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];
  assert.deepEqual(wall._pai.slice().sort(),physical.slice().sort());return wall;
 }});
}
type Replay = { factory: () => E; actions: {seat:number;id:string}[]; counters?: {variant:string;honba:number;sticks:number} };
const replays = new WeakMap<E, Replay>();
function remember(factory: () => E) { const g=factory();replays.set(g,{factory,actions:[]});return g; }
function make(variant:'yonma'|'sanma',hands:Record<number,string>,draws:string[]) { return remember(()=>rawMake(variant,hands,draws)); }
function capture(g:E):()=>E {
 const r=replays.get(g)!;assert.ok(r,"every fixture needs a fresh physical native replay");
 const actions=r.actions.map(a=>({...a})), counters=r.counters?{...r.counters}:undefined;
 return ()=>{const fresh=remember(r.factory);if(counters)metadata(fresh,counters.variant,counters.honba,counters.sticks);for(const action of actions)act(fresh,action.seat,action.id);return fresh;};
}
function act(g:E,seat:number,id:string){const v=g.view(seat);assert.ok(v.choices.some(c=>c.id===id),`seat${seat} lacks ${id}, phase${v.phase}, choices${v.choices.map(c=>c.id)}`);replays.get(g)?.actions.push({seat,id});g.respond(seat,v.decisionId,id)}
function pass(g:E,n:number){for(let guard=0;guard<12;guard++){let found=false;for(let s=0;s<n;s++){if(g.view(s).choices.some(c=>c.type==='pass')){act(g,s,'pass');found=true}}if(!found)return;}throw Error('reaction guard')}
function ack(g:E,n:number){for(let s=0;s<n;s++)act(g,s,'ack')}
function metadata(g:E,variant:string,honba:number,sticks:number){const replay=replays.get(g);assert.ok(replay);assert.equal(replay.actions.length,0,"only prior-hand counters may be seeded");replay.counters={variant,honba,sticks};const x=g as unknown as {honba:number;sticks:number;scores:number[];_model:{changbang:number;lizhibang:number;defen:number[]};_changbang:number};if(variant==='yonma'){x._model.changbang=honba;x._changbang=honba;x._model.lizhibang=sticks;x._model.defen[2]-=sticks*1000}else{x.honba=honba;x.sticks=sticks;x.scores[2]-=sticks*1000}}

function matrixFixture(variant:"yonma"|"sanma",winner:number,method:"ron"|"tsumo",bonus:boolean):Fixture {
 const n=variant==="yonma"?4:3;
 const draws=method==='ron'?(winner===0?['z6','z2']:['z2']):(winner===0?(n===4?['z6','z7','m9','s9','z2']:['z6','z7','m9','z2']):(n===4?['z6','z7','m9','s9','s8','z2']:['z6','z7','m9','s9','z2']));
 const g=make(variant,{[winner]:ready},draws);metadata(g,variant,bonus?2:0,bonus?1:0);
 if(method==='ron'){if(winner===0){act(g,0,'discard:z6_');pass(g,n)}act(g,winner===0?1:0,'discard:z2_');act(g,winner,'ron');pass(g,n)}
 else {for(let i=0;i<draws.length-1;i++){const seat=g.view(0).turnSeat;act(g,seat,'discard:'+g.view(seat).drawnTile+'_');pass(g,n)}act(g,winner,'tsumo')}
 const v=g.view(winner),s=v.settlement!;
 // Independently hand-checked standard totals; public sanma ron honba is 200.
 const values=variant==='sanma'?
  (method==='ron'?(winner===0?(bonus?[3400,-2400,0]:[2000,-2000,0]):(bonus?[-2000,3000,0]:[-1600,1600,0])):(winner===0?(bonus?[4000,-1500,-1500]:[2600,-1300,-1300]):(bonus?[-1500,3400,-900]:[-1300,2000,-700]))):
  (method==='ron'?(winner===0?(bonus?[3600,-2600,0,0]:[2000,-2000,0,0]):(bonus?[-2200,3200,0,0]:[-1600,1600,0,0])):(winner===0?(bonus?[5500,-1500,-1500,-1500]:[3900,-1300,-1300,-1300]):(bonus?[-1500,4300,-900,-900]:[-1300,2700,-700,-700])));
 // Numeric assertions follow the rendering label RED, so both failures are observable independently.
 const f={create:capture(g),name:`${variant}-${winner===0?'dealer':'child'}-${method}-${bonus?'seeded-honba2-pot1':'zero'}`,variant,game:v,settlement:s,room:room(v,variant,winner,method),...assertSettlement(s,method,'z2'),winningTile:'z2',title:method==='ron'?'荣和':'自摸'};
 const before=v.players.slice().sort((a,b)=>a.seat-b.seat).map(p=>p.score);ack(g,n);assert.deepEqual(g.view(0).players.slice().sort((a,b)=>a.seat-b.seat).map(p=>p.score),before.map((score,seat)=>score+s.delta[seat]));assert.equal(g.view(0).players.reduce((sum,p)=>sum+p.score,0),variant==='sanma'?105000:100000);
 expected.set(f.name,{delta:values,points:method==='ron'?(winner===0?2000:1600):(winner===0?(n===3?2600:3900):(n===3?2000:2700))});
 return f;
}
const expected=new Map<string,{delta:number[];points:number}>();
const fixtures:Fixture[]=[openSanmaRon(),riichiTsumo()];
for(const variant of ['yonma','sanma'] as const)for(const winner of [0,1])for(const method of ['ron','tsumo'] as const)for(const bonus of [false,true])fixtures.push(matrixFixture(variant,winner,method,bonus));
// Native per-winner payments are independently checked; each browser replay
// starts before any native ACK, traverses every detail, and pays the net once.
for(const variant of ['yonma','sanma'] as const){const n=variant==='sanma'?3:4,g=make(variant,{1:ready,2:'p789s456789z7772'},['z2']);metadata(g,variant,2,1);act(g,0,'discard:z2_');act(g,1,'ron');act(g,2,'ron');pass(g,n);const create=capture(g);
 for(const step of [1,2]){const v=g.view(0),s=v.settlement!;expected.set(`${variant}-multi-ron-${step}-seeded-counters`,{delta:variant==='sanma'?(step===1?[-2000,3000,0]:[-1700,0,1700]):(step===1?[-2200,3200,0,0]:[-1300,0,1300,0]),points:step===1?1600:1300});fixtures.push({create,name:`${variant}-multi-ron-${step}-seeded-counters`,variant,game:v,settlement:s,room:room(v,variant,0,`multi${step}`),...assertSettlement(s,'ron','z2'),winningTile:'z2',title:'荣和'});ack(g,n)}
}
// Actual riichi acceptance earns the pot and real ura indicators (not seeded).
for(const variant of ['yonma','sanma'] as const){const n=variant==='sanma'?3:4,draws=n===4?['z6','z7','m9','s9','s8','z2']:['z6','z7','m9','s9','z2'],g=make(variant,{1:ready},draws);act(g,0,'discard:z6_');pass(g,n);act(g,1,'riichi:z7_');pass(g,n);assert.equal(g.view(1).riichiSticks,1);assert.equal(g.view(1).players[1].score,n===3?34000:24000);for(let i=2;i<draws.length-1;i++){const seat=g.view(0).turnSeat;act(g,seat,'discard:'+g.view(seat).drawnTile+'_');pass(g,n)}act(g,1,'tsumo');const v=g.view(0),s=v.settlement!;assert.ok(s.uraIndicators.length);expected.set(`${variant}-actual-riichi-ura`,{delta:variant==='sanma'?[-4000,7000,-2000]:[-4000,9000,-2000,-2000],points:variant==='sanma'?6000:8000});fixtures.push({create:capture(g),name:`${variant}-actual-riichi-ura`,variant,game:v,settlement:s,room:room(v,variant,0,'riichi'),...assertSettlement(s,'tsumo','z2'),winningTile:'z2',title:'自摸'})}
// Physical three-dragon calls establish the real liable seat for tsumo and ron.
for(const method of ['tsumo','ron'] as const){
 const g=make('sanma',{1:method==='tsumo'?'p123s99z11556677':'p112s99z11556677'},method==='tsumo'?['z5','z6','z7','s8','s7','p3']:['z5','z6','z7','s8','p3']);metadata(g,'sanma',2,1);
 act(g,0,'discard:z5_');act(g,1,'pon:z555-');pass(g,3);act(g,1,'discard:s9');pass(g,3);act(g,2,'discard:z6_');act(g,1,'pon:z666+');pass(g,3);act(g,1,'discard:s9');pass(g,3);act(g,2,'discard:z7_');act(g,1,'pon:z777+');pass(g,3);act(g,1,method==='tsumo'?'discard:p3':'discard:p1');pass(g,3);act(g,2,'discard:s8_');pass(g,3);
 if(method==='tsumo'){act(g,0,'discard:s7_');pass(g,3);act(g,1,'tsumo')}else{act(g,0,'discard:p3_');act(g,1,'ron');pass(g,3)}
 const v=g.view(0),s=v.settlement!;assert.equal(s.yaku[0].name,'大三元');const name=`sanma-yakuman-pao-${method}`;
 expected.set(name,{delta:method==='tsumo'?[0,33400,-32400]:[-16400,33400,-16000],points:32000});
 fixtures.push({create:capture(g),name,variant:'sanma',game:v,settlement:s,room:room(v,'sanma',0,'pao'),...assertSettlement(s,method,'p3'),winningTile:'p3',title:method==='tsumo'?'自摸':'荣和'});
 const before=v.players.map(p=>p.score);ack(g,3);assert.deepEqual(g.view(0).players.map(p=>p.score),before.map((score,seat)=>score+s.delta[seat]));assert.equal(g.view(0).players.reduce((sum,p)=>sum+p.score,0),105000);
}
// Four-seat responsibility must come from three legal dragon pons. Seat 2
// supplies the final dragon; seat 0 is a different ron discarder. The fourth
// seat remains unchanged, so these literals also catch an ordinary-tsumo or
// single-discarder payment accidentally replacing pao in the engine DTO.
for (const method of ["tsumo", "ron"] as const) {
  const draws = method === "tsumo" ? ["z5", "z6", "z7", "s8", "s7", "s6", "p3"] : ["z5", "z6", "z7", "s8", "s7", "p3"];
  const g = make("yonma", { 1: method === "tsumo" ? "p123s99z11556677" : "p112s99z11556677" }, draws);
  assert.ok(g instanceof RiichiGame, "yonma pao uses the real four-seat engine");
  // Seed only prior-hand bookkeeping: two counters and one deposited stick
  // taken from seat 2. The three calls and winning Choice below are all legal.
  metadata(g, "yonma", 2, 1);
  act(g, 0, "discard:z5_"); act(g, 1, "pon:z555-"); pass(g, 4);
  act(g, 1, "discard:s9"); pass(g, 4);
  act(g, 2, "discard:z6_"); act(g, 1, "pon:z666+"); pass(g, 4);
  act(g, 1, "discard:s9"); pass(g, 4);
  act(g, 2, "discard:z7_"); act(g, 1, "pon:z777+"); pass(g, 4);
  assert.deepEqual(g.view(1).players.find(player => player.seat === 1)?.melds, ["z555-", "z666+", "z777+"], "the final dragon was legally supplied by liable seat 2");
  act(g, 1, method === "tsumo" ? "discard:p3" : "discard:p1"); pass(g, 4);
  act(g, 2, "discard:s8_"); pass(g, 4);
  act(g, 3, "discard:s7_"); pass(g, 4);
  if (method === "tsumo") {
    act(g, 0, "discard:s6_"); pass(g, 4); act(g, 1, "tsumo");
  } else {
    act(g, 0, "discard:p3_"); act(g, 1, "ron"); pass(g, 4);
  }
  const v = g.view(0), settlement = v.settlement!;
  assert.deepEqual(settlement.yaku, [{ name: "大三元", han: "*" }]);
  assert.equal(settlement.winnerSeat, 1);
  assert.equal(settlement.points, 32000, "child yakuman hand value excludes counters and pot");
  // Yonma 300 per counter: 600 paid by the liable seat on tsumo, or
  // the discarder on split ron; the winner also receives the 1000 deposit.
  const delta = method === "tsumo" ? [0, 33600, -32600, 0] : [-16600, 33600, -16000, 0];
  assert.deepEqual(settlement.delta, delta);
  const scores = (game: E) => game.view(0).players.slice().sort((a, b) => a.seat - b.seat).map(player => player.score);
  assert.deepEqual(scores(g), [25000, 25000, 24000, 25000]);
  assert.equal(scores(g).reduce((sum, score) => sum + score, 0) + v.riichiSticks * 1000, 100000, "pre-payment scores plus deposited stick conserve all points");
  assert.equal(settlement.delta.reduce((sum, transfer) => sum + transfer, 0), 1000, "only the deposited stick enters seat transfers");
  const name = `yonma-yakuman-pao-${method}`;
  expected.set(name, { delta, points: 32000 });
  fixtures.push({ create:capture(g), name, variant: "yonma", game: v, settlement, room: room(v, "yonma", 0, name), ...assertSettlement(settlement, method, "p3"), winningTile: "p3", title: method === "tsumo" ? "自摸" : "荣和" });
  ack(g, 4);
  assert.deepEqual(scores(g), method === "tsumo" ? [25000, 58600, -8600, 25000] : [8400, 58600, 8000, 25000], "all four legal acks apply the exact authoritative transfer");
  assert.equal(scores(g).reduce((sum, score) => sum + score, 0), 100000, "post-payment scores conserve every point");
}
// Optional exact-name selection bounds native reruns without hiding missing fixtures.
const requestedFixtures = process.env.SETTLEMENT_FIXTURES?.split(",").filter(Boolean);
if (requestedFixtures) {
  assert.ok(requestedFixtures.length > 0, "fixture filter must select at least one fixture");
  assert.equal(new Set(requestedFixtures).size, requestedFixtures.length, "fixture filter must contain unique names");
  for (const name of requestedFixtures) assert.ok(fixtures.some(fixture => fixture.name === name), `requested fixture is missing: ${name}`);
  const selected = fixtures.filter(fixture => requestedFixtures.includes(fixture.name));
  fixtures.splice(0, fixtures.length, ...selected);
}
console.log(`SELECTED ${fixtures.length} fixtures: ${fixtures.map(fixture => fixture.name).join(", ")}; ${fixtures.length * 6} native cases`);
const harness = `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';
const root=createRoot(document.getElementById('root'));let current,busy=false;
function paint(){flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={current} ownSeat={current.mySeat} connected motionCanAnimate={false} host busy={busy} onChoice={async choice=>{busy=true;paint();try{current=await window.realPaymentChoice({decisionId:current.game.decisionId,choiceId:choice.id});}finally{busy=false;paint();}}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/></div></main>));}
window.settlementApi={render:room=>{current=room;paint();},dispose:()=>root.unmount()};`;
const bundle = await build({ stdin:{contents:harness,resolveDir:process.cwd(),loader:"tsx"},bundle:true,platform:"browser",format:"iife",write:false,metafile:true,jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'} });
// Always use the formal page's actual CSS order, including camera, results and brush font.
const cssFiles=[...readFileSync('src/app/mahjong/page.tsx','utf8').matchAll(/import "\.\/([^"]+\.css)";/g)].map(m=>`src/app/mahjong/${m[1]}`);
const css=cssFiles.map(f=>readFileSync(f,'utf8')).join('\n');
const script=`globalThis.__name=(target,value)=>Object.defineProperty(target,"name",{value,configurable:true});globalThis.process={env:{NODE_ENV:"development"}};\n${bundle.outputFiles[0].text}`;
const numbers=(g:GameView)=>g.players.slice().sort((a,b)=>a.seat-b.seat).map(p=>p.score);
const faceList=(faces:string[])=>faces.slice().sort();

async function readyPaint(page:Page) {
 await page.clock.runFor(40);
 await page.evaluate(async()=>{
  await Promise.all([...document.querySelectorAll<HTMLImageElement>('.mahjong-settlement-panel img')].map(img=>img.decode()));
  for(const a of document.querySelector('.mahjong-settlement-panel')?.getAnimations({subtree:true})??[]) {
   if(Number.isFinite(Number(a.effect?.getComputedTiming().endTime)))a.finish();
  }
 });
}
async function inspectDetail(page:Page,fixture:Fixture,game:GameView) {
 const settlement=game.settlement!,parts=assertSettlement(settlement,settlement.winMethod!,settlement.winningTile!);
   const result = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[aria-label="和牌详情"]')!;
    const row = panel.querySelector<HTMLElement>(".mahjong-winning-hand__row")!;
    const closed = panel.querySelector<HTMLElement>('[role="group"][aria-label="闭手"]')!;
    const winning = panel.querySelector<HTMLElement>('[data-testid="mahjong-winning-tile"]')!;
    const meldWrapper = panel.querySelector<HTMLElement>(".mahjong-winning-hand__melds");
    const parts = [closed, winning, ...(meldWrapper ? [...meldWrapper.children] as HTMLElement[] : [])];
    const rect = (node: Element) => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
    const boxes = parts.map(rect);
    const gaps = boxes.slice(1).map((box, index) => box.x - boxes[index].right);
    const overlaps = boxes.flatMap((a, i) => boxes.slice(i + 1).map((b, j) => ({ i, j: i + 1 + j, area: Math.max(0, Math.min(a.right,b.right)-Math.max(a.x,b.x)) * Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)) }))).filter(pair => pair.area > 1);
    const rowBox = rect(row), faces = [...panel.querySelectorAll<HTMLElement>(".mahjong-winning-hand [data-tile-face]")], lastFace = faces.at(-1)!;
    const initialLast = rect(lastFace), initialScroll = { client: row.clientWidth, scroll: row.scrollWidth, overflow: getComputedStyle(row).overflowX };
    row.scrollLeft = row.scrollWidth;
    const scrolledLast = rect(lastFace), scrolledLeft = row.scrollLeft;
    const images = [...panel.querySelectorAll<HTMLImageElement>(".mahjong-settlement-panel img.mahjong-tile__art")].map(image => ({ complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }));
    return {
      title: panel.querySelector("h2")?.textContent?.trim(),
      totalFaces: panel.querySelectorAll(".mahjong-winning-hand [data-tile-face]").length,
      closedFaces: [...closed.querySelectorAll<HTMLElement>("[data-tile-face]")].map(tile => tile.dataset.tileFace!),
      winningFaces: [...winning.querySelectorAll<HTMLElement>("[data-tile-face]")].map(tile => tile.dataset.tileFace!),
      meldCount: panel.querySelectorAll(".mahjong-winning-hand__melds .mahjong-meld").length,
      meldFaces: [...(meldWrapper?.querySelectorAll<HTMLElement>("[data-tile-face]") ?? [])].map(tile => tile.dataset.tileFace!),
      boxes, gaps, overlaps, rowBox, initialLast, initialScroll, scrolledLast, scrolledLeft, images,
      rowInsidePanel: rowBox.x >= panel.getBoundingClientRect().x - 1 && rowBox.right <= panel.getBoundingClientRect().right + 1,
    };
  });

 const panel=page.getByRole('region',{name:'和牌详情'});
 assert.equal(await panel.locator('[data-settlement-seat]').count(),0,'details never display partial payments');
 assert.equal(await panel.getByText('牌型点数',{exact:true}).count(),1);
 assert.equal(await panel.getByText(`${names[settlement.winnerSeat!]} · ${settlement.winMethod==='ron'?'荣和':'自摸'}`,{exact:true}).count(),1);
 assert.equal(await panel.locator('.mahjong-settlement-panel__value b').textContent(),`${settlement.points!.toLocaleString('en-US')} 点`);
 assert.equal(result.title,settlement.winMethod==='ron'?'荣和':'自摸');
 assert.equal(result.totalFaces,14);
 assert.deepEqual(faceList(result.closedFaces),faceList(parts.closed));
 assert.deepEqual(result.winningFaces,[settlement.winningTile]);
 assert.equal(result.meldCount,parts.melds.length);
 assert.deepEqual(faceList(result.meldFaces),faceList(parts.melds.flat()));
 assert.equal(result.overlaps.length,0,`${fixture.name}: ${JSON.stringify(result.overlaps)}`);
 assert.ok(result.gaps.length===1+parts.melds.length&&result.gaps.every(g=>g>=8),JSON.stringify(result.gaps));
 assert.ok(result.rowInsidePanel&&result.rowBox.width>0&&result.rowBox.height>0);
 assert.equal(result.initialScroll.overflow,'auto');
 if(result.initialScroll.scroll>result.initialScroll.client+1) {
  assert.ok(result.scrolledLeft>0);
  assert.ok(result.scrolledLast.x>=result.rowBox.x-1&&result.scrolledLast.right<=result.rowBox.right+1);
 } else assert.ok(result.initialLast.x>=result.rowBox.x-1&&result.initialLast.right<=result.rowBox.right+1);
 assert.ok(result.images.length>0&&result.images.every(i=>i.complete&&i.width>0&&i.height>0));
 for(const [label,faces] of [['宝牌指示牌',game.doraIndicators],['里宝牌指示牌',settlement.uraIndicators]] as const) {
  const indicators=panel.getByRole('group',{name:label,exact:true});
  assert.deepEqual(await indicators.locator('[data-tile-face]').evaluateAll(els=>els.map(el=>el.getAttribute('data-tile-face'))),faces);
  assert.equal(await indicators.locator('[data-tile-face],.mahjong-indicator-back').count(),5);
  assert.equal(await indicators.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 }
 assert.match(await panel.locator('h2').evaluate(el=>getComputedStyle(el).fontFamily),/Yougui Mahjong Brush/);
 return result;
}
async function inspectAck(page:Page) {
 const panel=page.locator('.mahjong-settlement-panel');
 await panel.locator('.mahjong-settlement-panel__content').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 const ack=panel.getByRole('button',{name:/继续/});
 assert.equal(await ack.isDisabled(),false,'actual server-relative confirmation age enables the legal ACK');
 const geometry=await ack.evaluate(el=>{
  const s=getComputedStyle(el),b=el.getBoundingClientRect(),panel=el.closest('.mahjong-settlement-panel')!,content=panel.querySelector('.mahjong-settlement-panel__content')!.getBoundingClientRect(),footer=el.closest('footer')!.getBoundingClientRect();
  const lum=(color:string)=>{const rgb=color.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>{const c=v/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const fg=lum(s.color),bg=lum(s.backgroundColor);
  return {width:b.width,height:b.height,hit:el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)),visible:b.left>=0&&b.right<=innerWidth&&b.top>=0&&b.bottom<=innerHeight,footerAboveContent:footer.top>=content.bottom-1,contrast:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)};
 });
 assert.ok(geometry.width>=44&&geometry.height>=44&&geometry.hit&&geometry.visible&&geometry.footerAboveContent&&geometry.contrast>=4.5,JSON.stringify(geometry));
 return geometry;
}
const digest=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
writeFileSync(`${out}/manifest.json`,JSON.stringify({bundle:digest(bundle.outputFiles[0].text),css:digest(css),cssFiles,sources:Object.keys(bundle.metafile!.inputs).filter(f=>!f.startsWith('<')).map(file=>({file,sha256:digest(readFileSync(file))})),test:digest(readFileSync('tests/browser/mahjong-settlement-payment.tsx')),font:digest(readFileSync('public/fonts/mahjong-brush.woff2')),timing:'Paused Playwright device clock; real injected server clock supplies ready late-join ages. Natural timers and automatic ACK are covered separately by mahjong-settlement-sequence.tsx.'},null,2));
writeFileSync(`${out}/fixtures.json`,JSON.stringify(fixtures,null,2));
console.log(`ARTIFACTS ${out}`);
const results:unknown[]=[];
try {
 for(const engine of [chromium,webkit]) {
  const browser=await engine.launch({headless:true});
  try {for(const fixture of fixtures)for(const viewport of viewports) {
   const n=fixture.variant==='sanma'?3:4,own=fixture.room.mySeat!;
   // Replay every legal native choice fresh for every engine/viewport. Never
   // reuse an already-paid native game or patch its settlement/view fields.
   const native=fixture.create(),before=numbers(native.view(own)),handId=native.view(own).handId!,clock={value:0};
   const game=new SettlementSequenceGame(native,n,{now:()=>clock.value});
   const details:Settlement[]=[],acks:unknown[]=[];
   const view=()=>room(game.view(own),fixture.variant,own,fixture.name);
   const ageReady=()=>{const g=game.view(own),f=g.settlementFlow;if(f)clock.value+=Math.max(0,confirmationAt(f,g.settlement!)+(f.stage==='detail'&&f.detailIndex===0?1200:0)+100-f.elapsedMs);return view();};
   const page=await browser.newPage({viewport});const errors:string[]=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
   await page.exposeFunction('realPaymentChoice',(input:{decisionId:string;choiceId:string})=>{
    const previous=game.view(own);assert.equal(input.decisionId,previous.decisionId);
    assert.ok(previous.choices.some(c=>c.type==='ack'&&c.id===input.choiceId));
    game.respond(own,input.decisionId,input.choiceId);
    acks.push({stage:previous.settlementFlow!.stage,index:previous.settlementFlow!.detailIndex,decisionId:input.decisionId});
    return ageReady();
   });
   for(const [path,contentType] of [['fonts','font/woff2'],['images','image/webp']])await page.route(`https://mahjong.local/${path}/**`,route=>{const file=new URL(route.request().url()).pathname;return route.fulfill({contentType:file.endsWith('.svg')?'image/svg+xml':contentType,body:readFileSync('public'+file)});});
   await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*:before,*:after{box-sizing:border-box}${css}</style><div id="root"></div>`);
   await page.addScriptTag({content:script});await page.evaluate(r=>(window as any).settlementApi.render(r),ageReady());
   assert.equal(await page.evaluate(async()=>(await document.fonts.load('32px "Yougui Mahjong Brush"','荣和自摸')).length),1);
   const measurements:unknown[]=[];
   while(game.view(own).settlementFlow!.stage==='detail') {
    await page.getByRole('region',{name:'和牌详情'}).waitFor();await readyPaint(page);
    const g=game.view(own),s=g.settlement!;
    assert.deepEqual(numbers(g),before,'public scores stay at the original balance across every winner');
    const key=fixture.name.includes('-multi-ron-')?`${fixture.variant}-multi-ron-${g.settlementFlow!.detailIndex+1}-seeded-counters`:fixture.name;
    const e=expected.get(key);if(e){assert.deepEqual(s.delta,e.delta);assert.equal(s.points,e.points);}
    if(!fixture.name.includes('-multi-ron-'))assert.deepEqual(s,fixture.settlement,'fresh replay matches the saved authoritative native result');
    details.push(structuredClone(s));measurements.push({detail:await inspectDetail(page,fixture,g),ack:await inspectAck(page)});
    const index=acks.length;await page.getByRole('button',{name:/继续/}).click();
    // Locator waits observe the real async callback/render, not a manually
    // advanced presentation cursor or a fake acknowledgement list.
    await page.locator(`[data-settlement-stage="${details.length===g.settlementFlow!.detailCount?'scores':'detail'}"]`).waitFor();
    await readyPaint(page);assert.equal(acks.length,index+1);
   }
   const g=game.view(own),flow=g.settlementFlow!;
   assert.equal(flow.stage,'scores');assert.equal(flow.detailCount,details.length);
   const delta=Array.from({length:n},(_,seat)=>details.reduce((sum,s)=>sum+s.delta[seat],0));
   assert.deepEqual(flow.delta,delta);assert.deepEqual(flow.oldScores,before);assert.deepEqual(flow.newScores,before.map((v,s)=>v+delta[s]));
   assert.deepEqual(numbers(g),before);assert.deepEqual(numbers(native.view(own)),flow.newScores,'native engine pays exactly once behind the presentation barrier');
   const panel=page.getByRole('region',{name:'本局收支'});await panel.waitFor();await readyPaint(page);
   assert.equal(await panel.locator('.mahjong-winning-hand,ul,.mahjong-result-indicators').count(),0);
   assert.equal(await panel.locator('[data-settlement-seat]').count(),n);
   const payments=[];
   for(let seat=0;seat<n;seat++) {
    const cell=panel.locator(`[data-settlement-seat="${seat}"]`),d=delta[seat],num=(v:number)=>v.toLocaleString('en-US');
    assert.equal(await cell.getByText(`结算前 ${num(before[seat])}`,{exact:true}).count(),1);
    assert.equal(await cell.getByText(`${d>0?'获得 +':d<0?'支付 −':'不变 '}${num(Math.abs(d))}`,{exact:true}).count(),1);
    assert.equal(await cell.getByText(`结算后 ${num(flow.newScores[seat])}`,{exact:true}).count(),1);
    const metrics=await cell.evaluate(el=>({size:parseFloat(getComputedStyle(el.querySelector('b')!).fontSize),scroll:el.scrollWidth,width:el.clientWidth,box:el.getBoundingClientRect().toJSON()}));
    assert.ok(metrics.size>=14&&metrics.scroll<=metrics.width+1&&metrics.box.width>0&&metrics.box.height>0,JSON.stringify(metrics));
    payments.push({seat,before:before[seat],delta:d,after:flow.newScores[seat],...metrics});
   }
   const hit=await inspectAck(page);
   await page.screenshot({path:`${out}/${engine.name()}-${fixture.name}-${viewport.width}-net.png`});
   await panel.getByRole('button',{name:/继续/}).click();
   await page.getByRole('status').filter({hasText:'等待其他玩家'}).waitFor();
   assert.equal(acks.length,details.length+1);assert.deepEqual(acks.map((a:any)=>a.stage),[...details.map(()=> 'detail'),'scores']);
   assert.deepEqual(numbers(game.view(own)),before,'own confirmation cannot release the next hand');
   assert.equal(game.view(own).handId,handId);assert.equal(game.view(own).choices.length,0);
   for(let seat=0;seat<n;seat++)if(seat!==own) {
    assert.equal(game.view(seat).settlementFlow!.detailIndex,0,'other viewers retain independent detail cursors');
    for(let guard=0;guard<details.length+1;guard++) {const v=game.view(seat),ack=v.choices.find(c=>c.type==='ack');assert.ok(ack);game.respond(seat,v.decisionId,ack.id);}
   }
   const final=game.view(own);assert.equal(final.settlementFlow,undefined);assert.deepEqual(numbers(final),flow.newScores);
   assert.ok(final.ranking||final.handId===handId+1,'last legal seat ACK reveals either the next hand or actual native final ranking');
   assert.equal(numbers(final).reduce((sum,v)=>sum+v,0)+(final.riichiSticks??0)*1000,n===3?105000:100000);
   await page.evaluate(r=>(window as any).settlementApi.render(r),view());await readyPaint(page);
   assert.equal(await page.locator('.mahjong-settlement-panel').count(),0,'old result never replays after the final barrier');
   assert.deepEqual(errors,[]);
   results.push({browser:engine.name(),fixture:fixture.name,viewport,details:details.map(s=>({winner:s.winnerSeat,points:s.points,delta:s.delta})),measurements,payments,hit,acks,finalScores:numbers(final),finalRanking:!!final.ranking});
   writeFileSync(`${out}/proof.json`,JSON.stringify({cases:results.length,expectedCases:fixtures.length*6,source:'Fresh physical native replay → production SettlementSequenceGame → mounted GameRoom → actual all-seat ACK barrier',results},null,2));
   await page.close();console.log(`PASS ${engine.name()} ${fixture.name} ${viewport.width}: ${details.length} native details → one net payment → all-seat ACK barrier`);
  }}finally{await browser.close();}
 }
 console.log(`PASS ${results.length}/${fixtures.length*6} native payout browser cases in ${out}`);
}catch(error){writeFileSync(`${out}/failure.json`,JSON.stringify({passed:results.length,error:error instanceof Error?{message:error.message,stack:error.stack}:String(error)},null,2));throw error;}
