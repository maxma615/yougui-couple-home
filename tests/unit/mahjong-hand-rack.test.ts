import {expect,it} from 'vitest';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import {handRack,rackTileRank} from '@/components/mahjong/hand-rack';
for(const variant of ['sanma','yonma'] as const){
 it('sorts all fourteen while keeping the true drawn tile and stable identities '+variant,()=>{
  const game=physicalEngine(variant,{0:'p23987654s321z22'},'p1').view(0);
  const raw=handRack(game,0,true),sorted=handRack(game,1200,true);
  expect(raw.map(t=>t.value)).toEqual([...game.initialDeal!,'p1']);
  expect(sorted.map(t=>t.value)).toEqual(['p1','p2','p3','p4','p5','p6','p7','p8','p9','s1','s2','s3','z2','z2']);
  expect(sorted[0].logicalDraw).toBe(true);expect(sorted[0].tileId).toContain('drawn:');expect(sorted[0].separated).toBe(false);
  expect(sorted[13].value).toBe('z2');expect(sorted[13].logicalDraw).toBe(false);expect(sorted[13].separated).toBe(true);
  expect(raw.map(t=>t.key).sort()).toEqual(sorted.map(t=>t.key).sort());expect(new Set(sorted.map(t=>t.key)).size).toBe(14);
  expect(handRack(game,null,true)).toEqual(sorted);
  expect(handRack(game,null,false).at(-1)?.value).toBe('p1');
  expect(game.drawnTile).toBe('p1');expect(game.choices.find(c=>c.type==='discard'&&c.value==='p1_')).toBeTruthy();
 });
 it('falls back safely for legacy or invalid private metadata '+variant,()=>{
  const game=physicalEngine(variant,{0:'p23987654s321z22'},'p1').view(0);
  for(const initialDeal of [undefined,[],Array(13).fill('z7')])expect(handRack({...game,initialDeal},1200,true).at(-1)?.logicalDraw).toBe(true);
 });
}
it('uses standard suit order and places red fives before plain fives',()=>{
 expect(['z7','p5','p0','m9','s1','p4','p6'].sort((a,b)=>rackTileRank(a)-rackTileRank(b))).toEqual(['m9','p4','p0','p5','p6','s1','z7']);
});
