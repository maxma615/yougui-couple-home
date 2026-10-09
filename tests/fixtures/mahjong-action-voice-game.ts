import assert from 'node:assert/strict';
import {physicalEngine} from './mahjong-settlement-game';
import {kakanSoundFixture} from './mahjong-audio-game';
import {northReplacementFixture} from './mahjong-view-game';
import type {GameVariant,MahjongGame,RoomView} from '../../src/modules/mahjong/types';
export type ActionFixtureKind='chi'|'pon'|'open-kan'|'closed-kan'|'kakan-pass'|'kakan-robbed'|'north-own'|'north-opponent'|'north-pass'|'north-robbed'|'closed-kan-pass'|'closed-kan-robbed';
export function actionVoiceSequence(variant:GameVariant,kind:ActionFixtureKind){
 assert(kind!=='chi'||variant==='yonma');assert(!kind.startsWith('north')||variant==='sanma');assert(!kind.startsWith('kakan')||variant==='yonma');
 const hands:Record<number,string>=kind==='chi'?{0:'p3s123456789z123',1:'p12s123456789z45'}:kind==='open-kan'?{0:'p1s123456789z123',1:'p111s123456789z4'}:kind.startsWith('closed-kan')?{0:'p111s123456789z2'}:{0:'p1s123456789z123',1:'p11s123456789z45'};
 if(kind==='north-pass'||kind==='north-robbed'){Object.assign(hands,{0:'m19p222s444z11444',1:'p123456789s123z4'});}
 if(kind==='closed-kan-pass'||kind==='closed-kan-robbed')hands[1]='m19p99s19z1234567';
 const game:MahjongGame=kind.startsWith('kakan')?kakanSoundFixture(true):kind==='north-own'||kind==='north-opponent'?northReplacementFixture():physicalEngine(variant,hands,kind.startsWith('closed-kan')?'p1':kind==='north-pass'||kind==='north-robbed'?'s8':'p9');
 const mySeat=kind==='north-own'||kind.startsWith('closed-kan')?0:1,count=variant==='sanma'?3:4;let version=1;
 const view=():RoomView=>structuredClone({id:`voice-${variant}-${kind}`,code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat,game:game.view(mySeat),members:Array.from({length:count},(_,seat)=>({userId:String(seat),displayName:`玩家${seat+1}`,seat,kind:'human',ready:true,connected:true}))});
 const frames=[view()];
 const respond=(seat:number,type:string,value?:string)=>{const v=game.view(seat),c=v.choices.find(c=>c.type===type&&(!value||c.value===value));assert(c,`native legal ${type}`);game.respond(seat,v.decisionId,c.id);version++;frames.push(view());};
 if(kind==='chi'||kind==='pon'||kind==='open-kan'){
  respond(0,'discard',kind==='chi'?'p3':'p1');respond(1,kind==='open-kan'?'kan':kind);
 }else respond(kind.startsWith('kakan')?1:0,kind.startsWith('north')?'nuki':'kan');
 if(kind==='kakan-robbed')respond(2,'ron');
 else if(kind==='north-robbed'||kind==='closed-kan-robbed')respond(1,'ron');
 else for(let n=0;n<8;n++){
  const seat=Array.from({length:count},(_,s)=>s).find(s=>game.view(s).choices.some(c=>c.type==='pass'));
  if(seat===undefined)break;respond(seat,'pass');
 }
 return {frames,kind,variant};
}
