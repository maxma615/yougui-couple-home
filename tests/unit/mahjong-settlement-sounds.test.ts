import {describe,it,expect} from 'vitest';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import {SettlementSequenceGame} from '@/modules/mahjong/settlement-sequence';
import {acceptedSettlementSounds} from '@/components/mahjong/settlement-sounds';
import {makeTileSoundBuffer} from '@/components/mahjong/table-audio';
import type {RoomView} from '@/modules/mahjong/types';
import {declarationPair,declarationRoom} from '../fixtures/mahjong-declaration-game';
function fixture(variant:'sanma'|'yonma'){
 const native=physicalEngine(variant,{0:variant==='sanma'?'p123456s123z5552':'m123p123s123z1112'},'z2');
 const wrap=(game:RoomView['game'],version:number):RoomView=>({id:'sound',code:'ABCDEFGH',hostUserId:'0',mode:'east',variant,status:'playing',version,mySeat:0,game,members:[]});
 const before=wrap(native.view(0),1),turn=native.view(0),choice=turn.choices.find(c=>c.type==='tsumo');expect(choice).toBeTruthy();native.respond(0,turn.decisionId,choice!.id);
 const clock={value:0},sequence=new SettlementSequenceGame(native,variant==='sanma'?3:4,{now:()=>clock.value});const after=()=>wrap(sequence.view(0),2);
 return {before,after,clock,sequence,wrap};
}
describe('native live result sound phases',()=>{
 it.each(['sanma','yonma'] as const)('keeps native %s double-ron detail sounds separate and rolls the table total once',variant=>{
  const f=declarationPair(variant,'ron'),first=acceptedSettlementSounds(f.before,f.after);
  expect(first.length).toBeGreaterThan(0);expect(first[0].atMs).toBe(1500);
  let view=f.game.view(0);f.game.respond(0,view.decisionId,'ack');
  const second=declarationRoom(f.game,variant,12),next=acceptedSettlementSounds(f.after,second);
  expect(second.game!.settlementFlow!.detailIndex).toBe(1);expect(next.length).toBeGreaterThan(0);expect(next[0].atMs).toBe(300);
  expect(next.every(c=>!first.some(old=>old.id===c.id))).toBe(true);
  view=f.game.view(0);f.game.respond(0,view.decisionId,'ack');
  const scores=declarationRoom(f.game,variant,13);expect(acceptedSettlementSounds(second,scores).map(c=>c.kind)).toEqual(['score-roll']);
 });
 it.each(['sanma','yonma'] as const)('plans actual %s yaku and value after the win intro, then one score roll',variant=>{
  const f=fixture(variant),detail=f.after(),cues=acceptedSettlementSounds(f.before,detail),s=detail.game!.settlement!;
  expect(cues.filter(c=>c.kind==='yaku')).toHaveLength(Math.min(15,s.yaku.length));expect(cues[0].atMs).toBe(1500);
  expect(cues.at(-1)!.kind).toBe('hand-value');expect(cues.at(-1)!.atMs).toBe(1200+300+Math.min(15,s.yaku.length)*180);
  const g=f.sequence.view(0);f.sequence.respond(0,g.decisionId,'ack');const score=f.wrap(f.sequence.view(0),3);
  const roll=acceptedSettlementSounds(detail,score);expect(roll).toHaveLength(1);expect(roll[0]).toMatchObject({kind:'score-roll',atMs:1200,endMs:2190,elapsedMs:0});
  expect(acceptedSettlementSounds(score,score)).toEqual([]);
 });
 it.each(['sanma','yonma'] as const)('never sounds a first or late %s snapshot',variant=>{
  const f=fixture(variant);expect(acceptedSettlementSounds(null,f.after())).toEqual([]);
  f.clock.value=1500;expect(acceptedSettlementSounds(f.before,f.after())).toEqual([]);
 });
 it.each(['room','hand','instance','missed','negative-age','ranking'] as const)('rejects an unverifiable %s boundary',mode=>{
  const f=fixture('yonma'),after=f.after();
  if(mode==='room')after.id='other';if(mode==='hand')after.game!.handId!++;if(mode==='instance')after.game!.gameInstanceId='other';if(mode==='missed')after.version++;
  if(mode==='negative-age')after.game!.settlementFlow!.elapsedMs=-1;if(mode==='ranking')after.game!.ranking=[];
  expect(acceptedSettlementSounds(f.before,after)).toEqual([]);
 });
 it('does not start a late roll or invent audio for zero transfers',()=>{
  const f=fixture('yonma'),detail=f.after(),g=f.sequence.view(0);f.sequence.respond(0,g.decisionId,'ack');
  f.clock.value=1200;expect(acceptedSettlementSounds(detail,f.wrap(f.sequence.view(0),3))).toEqual([]);
  f.clock.value=0;const zero=f.wrap(f.sequence.view(0),3);zero.game!.settlementFlow!.delta.fill(0);expect(acceptedSettlementSounds(detail,zero)).toEqual([]);
 });
});
it.each(['yaku','hand-value','score-roll'] as const)('generates a finite, audible and unclipped original %s wave',kind=>{
 const rate=48000;let samples!:Float32Array;
 const context={sampleRate:rate,createBuffer:(_channels:number,n:number)=>{samples=new Float32Array(n);return {getChannelData:()=>samples};}};
 makeTileSoundBuffer(context as unknown as BaseAudioContext,kind);
 expect(samples.every(Number.isFinite)).toBe(true);expect(Math.max(...samples.map(Math.abs))).toBeGreaterThan(.05);expect(samples.every(s=>Math.abs(s)<.5)).toBe(true);expect(samples.length/rate).toBeLessThanOrEqual(.99);expect(Math.abs(samples.at(-1)!)).toBeLessThan(.001);
});
