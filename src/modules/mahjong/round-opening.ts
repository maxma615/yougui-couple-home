import type {RoomView,GameView,GameVariant} from '@/modules/mahjong/types';
export const ROUND_OPENING={waves:[0,300,600,900],tilesPerWave:4,doraAndSortMs:1200,operationsMs:1500} as const;
export const openingKey=(room:RoomView,seat=room.mySeat)=>room.game?.gameInstanceId&&Number.isInteger(room.game.handId)?JSON.stringify([room.id,room.game.gameInstanceId,room.game.handId,seat]):null;
export function isOpeningGame(game:GameView|null,variant:GameVariant){
 return Boolean(game?.gameInstanceId)&&Number.isInteger(game?.handId)&&game!.handId!>0
  &&game!.phase==='zimo'&&!game!.settlement&&!game!.ranking
  &&game!.players.length===(variant==='sanma'?3:4)
  &&game!.players.every(p=>p.discards.length===0&&p.melds.length===0&&!p.riichi&&(p.nuki??0)===0&&p.handCount>=13&&p.handCount<=14);
}
export const isUndealtRound=(room:RoomView)=>room.status==='playing'&&isOpeningGame(room.game,room.variant);
/** Only an accepted live transition can originate a deal. Initial GET/socket
 * baselines, a different membership and snapshots from an ongoing hand cannot. */
export function acceptedRoundOpening(before:RoomView|null,after:RoomView,live:boolean){
 if(!live||!before||before.id!==after.id||before.variant!==after.variant||before.mySeat!==after.mySeat||after.version<=before.version||!isUndealtRound(after))return null;
 if(before.status==='lobby'&&!before.game)return openingKey(after);
 return before.game&&before.status==='playing'&&openingKey(before)!==openingKey(after)?openingKey(after):null;
}
export const openingTileCount=(age:number|null,total:number)=>age===null?total:Math.min(total,ROUND_OPENING.tilesPerWave*(Math.floor(age/300)+1));
