import Majiang from '@kobalab/majiang-core';
import {RiichiGame} from '@/modules/mahjong/engine';
import {describe,expect,it} from 'vitest';
import {acceptedTableSounds} from '@/components/mahjong/table-sounds';
import {abortPhysicalEngine} from '../fixtures/mahjong-abort-game';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import {northReplacementFixture} from '../fixtures/mahjong-view-game';
import type {RoomView,GameVariant} from '@/modules/mahjong/types';
function room(game:ReturnType<typeof physicalEngine>,variant:GameVariant,version=1,seat=0):RoomView {
 return {id:'sound-room',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:seat,game:game.view(seat),members:Array.from({length:variant==='sanma'?3:4},(_,seat)=>({userId:String(seat),displayName:'玩家'+seat,seat,kind:'human',ready:true,connected:true}))};
}
function discardPair(variant:GameVariant='yonma'){
 const game=physicalEngine(variant,{0:'p1s123456789z123',1:'p11s123456789z45'},'p9'),before=room(game,variant);
 const choice=game.view(0).choices.find(c=>c.type==='discard')!;expect(choice).toBeTruthy();game.respond(0,before.game!.decisionId,choice.id);
 return {game,before,after:room(game,variant,2)};
}
describe('authoritative table sounds',()=>{
 it.each(['yonma','sanma'] as const)('sounds one accepted %s physical discard, never the initial baseline',variant=>{
  const {before,after}=discardPair(variant);expect(acceptedTableSounds(null,after)).toEqual([]);
  expect(acceptedTableSounds(before,after)).toMatchObject([{kind:'discard',seat:0,id:`discard:sound-room:${after.game!.gameInstanceId}:1:0:0`}]);
 });
 it.each(['refresh','gap','old','room','viewer','variant','instance','hand','decision','missing','rewrite'] as const)('silences unproved %s snapshots',reason=>{
  const {before,after}=discardPair();
  if(reason==='refresh')after.version=before.version;
  if(reason==='gap')after.version+=2;
  if(reason==='old')after.version=0;
  if(reason==='room')after.id='elsewhere';
  if(reason==='viewer')after.mySeat=1;
  if(reason==='variant')after.variant='sanma';
  if(reason==='instance')after.game!.gameInstanceId='another';
  if(reason==='hand')after.game!.handId=2;
  if(reason==='decision')after.game!.decisionId=before.game!.decisionId;
  if(reason==='missing')after.game!.gameInstanceId=undefined;
  if(reason==='rewrite')after.game!.players[1].melds=['p111-'];
  expect(acceptedTableSounds(before,after)).toEqual([]);
 });
 it('emits the accepted north extraction and actual replacement as distinct cues',()=>{
  const game=northReplacementFixture(),before=room(game,'sanma');const choice=game.view(0).choices.find(c=>c.type==='nuki')!;
  game.respond(0,before.game!.decisionId,choice.id);
  for(let seat=1;seat<3;seat++){const v=game.view(seat),pass=v.choices.find(c=>c.type==='pass');if(pass)game.respond(seat,v.decisionId,pass.id);}
  const after=room(game,'sanma',2);expect(acceptedTableSounds(before,after)).toMatchObject([{kind:'nuki',seat:0},{kind:'draw',seat:0,replacement:true}]);
  expect(new Set(acceptedTableSounds(before,after).map(c=>c.id)).size).toBe(2);
 });
 it('proves a native opponent draw after the last reaction, without exposing its tile',()=>{
  const {game,after}=discardPair();let prior=after,found=false;
  for(let seat=1;seat<4;seat++){
   const v=game.view(seat),pass=v.choices.find(c=>c.type==='pass');if(!pass)continue;
   game.respond(seat,v.decisionId,pass.id);const next=room(game,'yonma',prior.version+1);
   if(next.game!.phase==='zimo'){
    const cues=acceptedTableSounds(prior,next);expect(cues).toMatchObject([{kind:'draw',seat:1,replacement:false}]);expect(cues[0]).not.toHaveProperty('tile');found=true;
   }prior=next;
  }expect(found).toBe(true);
 });
 it.each(['sanma','yonma'] as const)('uses native %s ankan and replacement without false discard',variant=>{
  const game=physicalEngine(variant,{0:'p111s123456789z2'},'p1'),before=room(game,variant);const c=game.view(0).choices.find(c=>c.type==='kan')!;expect(c).toBeTruthy();game.respond(0,before.game!.decisionId,c.id);
  for(let seat=1;seat<(variant==='sanma'?3:4);seat++){const v=game.view(seat),pass=v.choices.find(c=>c.type==='pass');if(pass)game.respond(seat,v.decisionId,pass.id);}
  expect(acceptedTableSounds(before,room(game,variant,2))).toMatchObject([{kind:'call',seat:0},{kind:'draw',seat:0,replacement:true}]);
 });
});

it('preserves two distinct sounds when native discard immediately deals the next tile',()=>{
 const game=physicalEngine('yonma',{0:'p1s123456789z123',1:'m123456789s123z4',2:'m111222333s456z5',3:'p111222333s789z7'},'p9'),before=room(game,'yonma');const v=game.view(0),c=v.choices.find(c=>c.type==='discard'&&c.value==='p9_')!;expect(c).toBeTruthy();game.respond(0,v.decisionId,c.id);
 const after=room(game,'yonma',2);expect(after.game!.phase).toBe('zimo');expect(acceptedTableSounds(before,after)).toMatchObject([{kind:'discard',seat:0},{kind:'draw',seat:1,replacement:false}]);
});
it.each(['chi','pon','kan'] as const)('recognizes a native open %s without sounding the claimed discard twice',type=>{
 const hands=type==='chi'?{0:'p3s123456789z123',1:'p12s123456789z45'}:type==='pon'?{0:'p1s123456789z123',1:'p11s123456789z45'}:{0:'p1s123456789z123',1:'p111s123456789z4'};
 const game=physicalEngine('yonma',hands,'p9');let v=game.view(0),c=v.choices.find(c=>c.type==='discard'&&c.value=== (type==='chi'?'p3':'p1'))!;expect(c).toBeTruthy();game.respond(0,v.decisionId,c.id);
 const before=room(game,'yonma');v=game.view(1);c=v.choices.find(c=>c.type===type)!;expect(c).toBeTruthy();game.respond(1,v.decisionId,c.id);
 for(let seat=2;seat<4;seat++){const w=game.view(seat),pass=w.choices.find(c=>c.type==='pass');if(pass)game.respond(seat,w.decisionId,pass.id);}
 const cues=acceptedTableSounds(before,room(game,'yonma',2));expect(cues[0]).toMatchObject({kind:'call',seat:1});expect(cues.some(c=>c.kind==='discard')).toBe(false);expect(cues.length).toBe(type==='kan'?2:1);
});

it.each([['sanma',1],['sanma',2],['yonma',1],['yonma',2],['yonma',3]] as const)('retains native seat identity after %s dealer rotation %s',(variant,dealer)=>{
 const game=abortPhysicalEngine(variant,{},'p9',dealer),before=room(game,variant);const v=game.view(dealer),c=v.choices.find(c=>c.type==='discard'&&c.value==='p9_')!;expect(c).toBeTruthy();game.respond(dealer,v.decisionId,c.id);
 expect(acceptedTableSounds(before,room(game,variant,2))[0]).toMatchObject({kind:'discard',seat:dealer});
});
it('gives repeated legal north extractions different identities',()=>{
 const game=northReplacementFixture(true);let before=room(game,'sanma');const keys:string[]=[];
 for(let n=0;n<2;n++){
  const v=game.view(0),c=v.choices.find(c=>c.type==='nuki')!;expect(c).toBeTruthy();game.respond(0,v.decisionId,c.id);
  for(let seat=1;seat<3;seat++){const w=game.view(seat),p=w.choices.find(c=>c.type==='pass');if(p)game.respond(seat,w.decisionId,p.id);}
  const after=room(game,'sanma',before.version+1),cues=acceptedTableSounds(before,after);expect(cues).toHaveLength(2);keys.push(...cues.map(c=>c.id));before=after;
 }expect(new Set(keys).size).toBe(4);
});

it('does not infer a physical discard from a non-discard decision phase',()=>{
 const {before,after}=discardPair();before.game!.phase='qipai';expect(acceptedTableSounds(before,after)).toEqual([]);
});

it('proves native kakan after a real pon and three subsequent turns',()=>{
 const hands=['p1s123456789z123','p11s123456789z45','m123456789s123z4','m111222333s456z5'];
 const game=new RiichiGame('east',['A','B','C','D'],{dealer:0,wallFactory:rule=>{
  const wall=new Majiang.Shan(rule),physical=wall._pai.slice(),available=physical.slice();
  const take=(t:string)=>{const i=available.indexOf(t);expect(i).toBeGreaterThanOrEqual(0);return available.splice(i,1)[0];};
  const dealt=hands.map(h=>[...h.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>take(m[1]+n))));
  expect(dealt.every(h=>h.length===13)).toBe(true);
  const sequence=['p9','m9','m8','m7','p1'].map(take),dora=take('z6'),ura=take('z6');
  wall._pai=[...available.slice(0,4),dora,...available.slice(4,8),ura,...available.slice(8),...sequence.reverse(),...dealt.flat().reverse()];
  expect(wall._pai.slice().sort()).toEqual(physical.sort());wall._baopai=[dora];wall._fubaopai=[ura];return wall;
 }});
 const choose=(seat:number,type:string,pick?:(v:string|undefined)=>boolean)=>{const v=game.view(seat),c=v.choices.find(c=>c.type===type&&(!pick||pick(c.value)))!;expect(c).toBeTruthy();game.respond(seat,v.decisionId,c.id);};
 const passAll=()=>{for(let n=0;n<20;n++){let passed=false;for(let seat=0;seat<4;seat++){const v=game.view(seat),c=v.choices.find(c=>c.type==='pass');if(c){game.respond(seat,v.decisionId,c.id);passed=true;}}if(!passed)return;}throw Error('Unbounded native reactions');};
 choose(0,'discard',v=>v==='p1');choose(1,'pon');passAll();choose(1,'discard');passAll();
 for(const seat of [2,3,0]){expect(game.view(seat).turnSeat).toBe(seat);choose(seat,'discard',v=>!!v?.endsWith('_'));passAll();}
 const before=room(game,'yonma');expect(before.game!.turnSeat).toBe(1);choose(1,'kan',v=>!!v?.match(/^[mpsz]\d{3}[+\-=]\d$/));
 for(let seat=0;seat<4;seat++){const v=game.view(seat),pass=v.choices.find(c=>c.type==='pass');if(pass)game.respond(seat,v.decisionId,pass.id);}
 const cues=acceptedTableSounds(before,room(game,'yonma',2));expect(cues).toMatchObject([{kind:'call',seat:1},{kind:'draw',seat:1,replacement:true}]);expect(new Set(cues.map(c=>c.id)).size).toBe(2);
});
