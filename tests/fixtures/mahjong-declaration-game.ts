import assert from 'node:assert/strict';
import {SettlementSequenceGame} from '../../src/modules/mahjong/settlement-sequence';
import {physicalEngine} from './mahjong-settlement-game';
import type {Choice, GameVariant, MahjongGame, RoomView} from '../../src/modules/mahjong/types';
export const declarationRoom=(game:MahjongGame,variant:GameVariant,version:number,seat=0):RoomView=>({id:'declaration-room',code:'ABCDEFGH',hostUserId:'0',variant,mode:'east',status:'playing',version,mySeat:seat,game:game.view(seat),members:Array.from({length:variant==='sanma'?3:4},(_,seat)=>({userId:String(seat),displayName:`玩家${seat+1}`,seat,kind:'human',ready:true,connected:true}))});
export function declarationChoose(game:MahjongGame,seat:number,type:Choice['type']){
 const v=game.view(seat),c=v.choices.find(c=>c.type===type);assert.ok(c,`native legal ${type}`);game.respond(seat,v.decisionId,c.id);
}
export function declarationPair(variant:GameVariant,kind:'ron'|'tsumo'|'riichi'){
 const count=variant==='sanma'?3:4;
 const game=new SettlementSequenceGame(physicalEngine(variant,kind==='ron'?{1:'p123456789s123z2',2:'p123456789s123z2'}:{0:'p123456789s123z2'},'z2'),count);
 if(kind==='ron'){
  const v=game.view(0),c=v.choices.find(c=>c.type==='discard'&&c.value==='z2_');assert.ok(c);game.respond(0,v.decisionId,c.id);declarationChoose(game,1,'ron');
 }
 const before=declarationRoom(game,variant,10);declarationChoose(game,kind==='ron'?2:0,kind);
 return {before,after:declarationRoom(game,variant,11),game};
}
