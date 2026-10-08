import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {RoomStore} from '../../src/modules/mahjong/rooms';
import {drawEngine} from './mahjong-draw-game';
import type {GameVariant,MahjongCommand,RoomView} from '../../src/modules/mahjong/types';
/** Complete native physical-wall games, including all seats' result ACKs. */
export function rankingPair(variant:GameVariant,lastBot=false){
 const count=variant==='sanma'?3:4;let now=1000;
 const people=Array.from({length:count},(_,seat)=>({userId:randomUUID(),displayName:`P${seat}`}));
 const store=new RoomStore({now:()=>now,gameFactory:v=>drawEngine(v,[],{hands:['m19p369s369z14577','m19p147s258z13566','m19p258s147z23477','m2346p3468s2468z3']})});
 const send=(seat:number,input:object)=>store.execute(people[seat],{...input,nonce:randomUUID()} as MahjongCommand)!;
 const room=send(0,{action:'create',mode:'east',variant});
 for(let seat=1;seat<count-(lastBot?1:0);seat++)send(seat,{action:'join',code:room.code});
 if(lastBot)send(0,{action:'fill-bots',roomId:room.id});
 store.connection(people[0].userId,1);
 for(let seat=0;seat<count-(lastBot?1:0);seat++)send(seat,{action:'ready',roomId:room.id,ready:true});
 send(0,{action:'start',roomId:room.id});
 const view=()=>store.view(people[0].userId)!;let before:RoomView=view();
 for(let step=0;step<3000&&view().status!=='finished';step++){
  let acted=false;
  for(let seat=0;seat<count;seat++){
   const bot=lastBot&&seat===count-1?store.botDecisions().find(j=>j.seat===seat):undefined;
   if(lastBot&&seat===count-1&&!bot)continue;
   const g=bot?.view??store.view(people[seat].userId)!.game!;
   const choice=g.choices.find(c=>c.type==='ack')??g.choices.find(c=>c.type==='pass')??g.choices.find(c=>c.type==='discard'&&c.value?.endsWith('_'));
   if(!choice)continue;
   before=view();now++;
   if(bot)assert(store.respondBot(bot,choice.id));else send(seat,{action:'respond',roomId:room.id,decisionId:g.decisionId,choiceId:choice.id});
   acted=true;break;
  }
  assert(acted,'native final progression');
 }
 assert.equal(view().status,'finished');assert.equal(before.status,'playing');
 return {before,after:view(),view,advance:(ms:number)=>{now+=ms;},store};
}
