import Majiang from '@kobalab/majiang-core';
import {sanmaRule} from '@/modules/mahjong/sanma-scoring';
import type {GameVariant,GameView} from '@/modules/mahjong/types';
export type DiscardWait = {tile:string;remaining:number;ronYaku:boolean;tsumoYaku:boolean;furiten:boolean};
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
  const waiting=[...new Set(Majiang.Util.tingpai(hand)??[])].filter(tile=>variant!=='sanma'||!/^m[2-8]$/.test(tile));
  // Own discard clears ordinary missed-ron furiten. A declared riichi keeps
  // its existing block; permanent furiten includes the prospective discard.
  const river=[...own.discards,choice.value].map(normal);
  const furiten=Boolean(own.riichi&&game.ronBlocked)||waiting.some(tile=>river.includes(normal(tile)));
  const param=Majiang.Util.hule_param({rule:variant==='sanma'?sanmaRule:Majiang.rule(),zhuangfeng:game.roundWind,menfeng:own.wind,lizhi:(own.riichi||choice.type==='riichi')?1:0});
  return waiting.map(tile=>({tile,remaining:Math.max(0,4-(visible.get(normal(tile))??0)),
   ronYaku:Boolean(Majiang.Util.hule(hand.clone(),tile+'+',param)?.hupai?.length),
   tsumoYaku:Boolean(Majiang.Util.hule(hand.clone().zimo(tile),null,param)?.hupai?.length),furiten}));
 }catch{return []}
}
