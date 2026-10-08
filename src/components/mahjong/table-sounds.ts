import type {RoomView} from '@/modules/mahjong/types';
import {acceptedNukiEvent} from './nuki-motion';
import {acceptedPublicCallEvent} from './public-call-motion';
import {createDiscardEventId} from './discard-motion';

export type TableSoundEvent = {id:string;kind:'discard'|'draw'|'call'|'nuki';seat:number;replacement?:boolean};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** Public event identities only: no hidden tile is needed to make a sound. */
export function acceptedTableSounds(before:RoomView|null,after:RoomView):TableSoundEvent[]{
 const old=before?.game,game=after.game;
 if(!before||!old||!game||before.status!=='playing'||after.status!=='playing'
  ||before.id!==after.id||before.variant!==after.variant||before.mySeat!==after.mySeat
  ||after.version!==before.version+1||!old.gameInstanceId||old.gameInstanceId!==game.gameInstanceId
  ||!Number.isInteger(old.handId)||old.handId!<1||old.handId!==game.handId
  ||!old.decisionId||old.decisionId===game.decisionId||!game.decisionId||old.settlement)return [];
 const count=after.variant==='sanma'?3:4;
 if([old,game].some(v=>v.players.length!==count||new Set(v.players.map(p=>p.seat)).size!==count
  ||v.players.some(p=>!Number.isInteger(p.seat)||p.seat<0||p.seat>=count)))return [];
 const draw=(replacement:boolean):TableSoundEvent=>({kind:'draw',seat:game.turnSeat,replacement,
  id:JSON.stringify(['draw',after.id,game.gameInstanceId,game.handId,game.decisionId,game.turnSeat])});
 const nuki=acceptedNukiEvent(before,after);
 if(nuki)return [{id:nuki.id,kind:'nuki',seat:nuki.seat},draw(true)];
 const call=acceptedPublicCallEvent(before,after);
 if(call)return [{id:call.id,kind:'call',seat:call.seat},...(game.phase==='gangzimo'?[draw(true)]:[])];
 let discard:TableSoundEvent|undefined;
 for(const prior of old.players){
  const p=game.players.find(p=>p.seat===prior.seat)!;
  if(!same(prior.melds,p.melds)||(prior.nuki??0)!==(p.nuki??0))return [];
  if(same(prior.discards,p.discards)){
   if(prior.riichi!==p.riichi)return [];
   continue;
  }
  if(discard||!['zimo','gangzimo','nukizimo','fulou'].includes(old.phase)||p.seat!==old.turnSeat||p.discards.length!==prior.discards.length+1
   ||!same(prior.discards,p.discards.slice(0,-1))||!/^([mps][0-9]|z[1-7])_?\*?$/.test(p.discards.at(-1)!))return [];
  if(prior.riichi!==p.riichi&&(prior.riichi||!p.riichi||!p.discards.at(-1)!.endsWith('*')))return [];
  discard={id:createDiscardEventId({roomId:after.id,gameInstanceId:game.gameInstanceId!,handId:game.handId!,seat:p.seat,index:prior.discards.length}),kind:'discard',seat:p.seat};
 }
 const result=discard?[discard]:[];
 // One accepted state can contain both a discard and an immediate next draw.
 // Reaction-only versions have neither cue; no catch-up history is inferred.
 const player=game.players.find(p=>p.seat===game.turnSeat),prior=old.players.find(p=>p.seat===game.turnSeat);
 if(!game.settlement&&game.phase==='zimo'&&(old.phase==='dapai'||Boolean(discard&&['zimo','gangzimo','nukizimo','fulou'].includes(old.phase)))
  &&game.turnSeat===(old.turnSeat+1)%count&&game.remainingTiles===old.remainingTiles-1
  &&player?.hasDrawnTile===true&&prior?.hasDrawnTile!==true)result.push(draw(false));
 return result;
}
