import assert from 'node:assert/strict';
import Majiang from '@kobalab/majiang-core';
import {RiichiGame} from '../../src/modules/mahjong/engine';
import {SanmaGame} from '../../src/modules/mahjong/sanma';
import {SanmaWall,sanmaTiles} from '../../src/modules/mahjong/sanma-wall';
import type {GameVariant,MahjongGame,RoomView} from '../../src/modules/mahjong/types';
/** Conserved native wall: z6 is dora initially; a real closed kan makes z7 dora. */
export function doraKanSequence(variant:GameVariant){
 const arrange=(physical:string[],sanma:boolean)=>{
  const available=physical.slice().sort();
  const take=(tile:string)=>{const i=available.indexOf(tile);assert(i>=0,`physical ${tile}`);return available.splice(i,1)[0];};
  const own=['p1','p1','p1',...'12345678'].map((t,i)=>i<3?t:'s'+t).concat(['z6','z7']).map(take),draw=take('p1');
  const dora=['z5','z6'].map(take),ura=['z1','z2'].map(take);
  while(dora.length<5)dora.push(available.shift()!);
  while(ura.length<5)ura.push(available.shift()!);
  const reserve=available.splice(0,4),dealt=[own,...Array.from({length:sanma?2:3},()=>available.splice(0,13))];
  const ordered=sanma?[...dealt.flat(),draw,...available,...reserve,...dora.flatMap((tile,i)=>[tile,ura[i]])]:[...reserve,...dora,...ura,...available,...[...dealt,[draw]].flat().reverse()];
  assert.deepEqual(ordered.slice().sort(),physical.slice().sort(),'all physical tiles conserved');return ordered;
 };
 const game:MahjongGame=variant==='sanma'?new SanmaGame('east',['A','B','C'],{dealer:0,wallFactory:()=>new SanmaWall(arrange(sanmaTiles(),true))}):new RiichiGame('east',['A','B','C','D'],{dealer:0,wallFactory:rule=>{const wall=new Majiang.Shan(rule);wall._pai=arrange(wall._pai,false);wall._baopai=[wall._pai[4]];wall._fubaopai=[wall._pai[9]];return wall;}});
 let version=1;
 const view=():RoomView=>({id:'dora-kan-native',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:0,game:game.view(0),members:game.view(0).players.map(p=>({seat:p.seat,userId:String(p.seat),displayName:'玩家'+p.seat,kind:'human',ready:true,connected:true}))});
 const frames=[structuredClone(view())];
 const g=game.view(0),kan=g.choices.find(c=>c.type==='kan');assert(kan);game.respond(0,g.decisionId,kan.id);version++;frames.push(structuredClone(view()));
 for(let i=0;i<8;i++){const seat=game.view(0).players.map(p=>p.seat).find(s=>game.view(s).choices.some(c=>c.type==='pass'));if(seat===undefined)break;const g=game.view(seat),pass=g.choices.find(c=>c.type==='pass')!;game.respond(seat,g.decisionId,pass.id);version++;frames.push(structuredClone(view()));}
 assert.deepEqual(frames[0].game!.doraIndicators,['z5']);assert.deepEqual(frames.at(-1)!.game!.doraIndicators,['z5','z6']);
 assert(frames.at(-1)!.game!.hand.includes('z7'));return frames;
}
