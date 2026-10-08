import Majiang from '@kobalab/majiang-core';
import type {GameVariant,GameView} from '@/modules/mahjong/types';
export type DiscardWait = {tile:string;remaining:number};
const normal=(tile:string)=>tile.slice(0,2).replace('0','5');
/** Shape waits after an offered discard. Counts use only this player's hand
 * and publicly exposed tiles; they are not a prediction of the live wall. */
export function discardWaits(game:GameView,seat:number,variant:GameVariant,choiceId:string):DiscardWait[]{
 const choice=game.choices.find(c=>c.id===choiceId&&(c.type==='discard'||c.type==='riichi'));
 const own=game.players.find(p=>p.seat===seat);
 if(!choice?.value||!own||game.settlement||game.ranking)return [];
 const physical=game.hand.slice();const index=physical.indexOf(choice.value.slice(0,2));
 if(index<0)return [];
 physical.splice(index,1);
 if(physical.length+own.melds.length*3!==13)return [];
 try{
  const hand=Majiang.Shoupai.fromString(physical.join('')+(own.melds.length?','+own.melds.join(','):''));
  if(Majiang.Util.xiangting(hand)!==0)return [];
  const visible=new Map<string,number>();
  const add=(tile:string)=>{const key=normal(tile);visible.set(key,(visible.get(key)??0)+1)};
  game.hand.forEach(add);game.doraIndicators.forEach(add);
  for(const player of game.players){
   player.discards.filter(t=>!/[+=-]$/.test(t)).forEach(add);
   for(const meld of player.melds)for(const rank of meld.match(/\d/g)??[])add(meld[0]+rank);
   for(let n=0;n<(player.nuki??0);n++)add('z4');
  }
  return [...new Set(Majiang.Util.tingpai(hand)??[])].filter(tile=>variant!=='sanma'||!/^m[2-8]$/.test(tile))
   .map(tile=>({tile,remaining:Math.max(0,4-(visible.get(normal(tile))??0))}));
 }catch{return []}
}
