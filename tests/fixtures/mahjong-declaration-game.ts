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
export function nukiRonPair(kind:'normal'|'double'|'kokushi'='normal'){
 const hands:Record<number,string>=kind==='double'?{0:'m119p222s444z1144',1:'p123456789s123z4',2:'p456789s456z3334'}:
  {0:'m19p222s444z11444',1:kind==='kokushi'?'m19p19s19z1234567':'p123456789s123z4'};
 const game=new SettlementSequenceGame(physicalEngine('sanma',hands,'s8'),3);
 declarationChoose(game,0,'nuki');
 if(kind==='double')declarationChoose(game,1,'ron');
 const before=declarationRoom(game,'sanma',10);declarationChoose(game,kind==='double'?2:1,'ron');
 return {before,after:declarationRoom(game,'sanma',11),game};
}
