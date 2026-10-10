import {expect,it} from 'vitest';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
const input='p987654321s321z2';
const raw=['p9','p8','p7','p6','p5','p4','p3','p2','p1','s3','s2','s1','z2'];
for(const variant of ['sanma','yonma'] as const){
 for(const dealer of [0,2])it(`preserves real wall deal order for owner seat ${dealer} in ${variant}`,()=>{
  const game=physicalEngine(variant,{[dealer]:input},'z2',dealer),view=game.view(dealer);
  expect(view.initialDeal).toEqual(raw);
  expect(view.hand.slice(0,-1)).not.toEqual(raw);
  expect(view.drawnTile).toBe('z2');
  const capacity=variant==='sanma'?3:4;
  for(let seat=0;seat<capacity;seat++){
   const own=game.view(seat),concealed=own.drawnTile?own.hand.slice(0,-1):own.hand;
   expect(own.initialDeal?.slice().sort()).toEqual(concealed.slice().sort());
   expect(own.players.every(p=>!('initialDeal' in p)&&!('hand' in p))).toBe(true);
  }
  view.initialDeal![0]='z7';expect(game.view(dealer).initialDeal).toEqual(raw);
  expect(()=>game.respond(dealer,view.decisionId,'illegal')).toThrow();
  expect(game.view(dealer).initialDeal).toEqual(raw);
  const discard=view.choices.find(c=>c.type==='discard')!;
  game.respond(dealer,view.decisionId,discard.id);
  for(let seat=0;seat<capacity;seat++)expect(game.view(seat).initialDeal).toBeUndefined();
 });
 it(`replaces opening metadata after settlement and dealer repeat in ${variant}`,()=>{
  const game=physicalEngine(variant,{0:input},'z2'),before=game.view(0);
  const win=before.choices.find(c=>c.type==='tsumo')!;expect(win).toBeTruthy();
  game.respond(0,before.decisionId,win.id);
  for(let seat=0;seat<(variant==='sanma'?3:4);seat++){
   const v=game.view(seat);expect(v.initialDeal).toBeUndefined();
   const ack=v.choices.find(c=>c.type==='ack')!;game.respond(seat,v.decisionId,ack.id);
  }
  const next=game.view(0);expect(next.handId).toBe(before.handId!+1);expect(next.initialDeal).toEqual(raw);
 });
}
