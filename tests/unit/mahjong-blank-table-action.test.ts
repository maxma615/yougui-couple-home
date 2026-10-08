import {it,expect} from 'vitest';
import {blankTableAction} from '@/components/mahjong/blank-table-action';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
for(const variant of ['sanma','yonma'] as const){
 it(variant+' uses the exact drawn operation even when a win or north is offered',()=>{
  for(const drawn of ['s2','z2','z4']){
   const g=physicalEngine(variant,{0:'p123456789s123z2'},drawn).view(0);
   const a=blankTableAction(g,0,false,false);
   expect(a?.kind).toBe('choice');if(a?.kind==='choice'){expect(g.choices).toContainEqual(a.choice);expect(a.choice.value).toBe(drawn+'_');expect(a.choice.type).toBe('discard');}
  }
 });
 it(variant+' returns from riichi or a self picker without discarding',()=>{
  const g=physicalEngine(variant,{0:'p123456789s123z2'},'z3').view(0);
  expect(blankTableAction(g,0,true,false)).toEqual({kind:'return-riichi'});
  expect(blankTableAction(g,0,false,true)).toEqual({kind:'return-picker'});
 });
 it(variant+' passes a native ron offer rather than executing a win',()=>{
  const e=physicalEngine(variant,{0:'p789s234567z1234',1:'p1123456789s123'},'p1'),g=e.view(0);
  e.respond(0,g.decisionId,g.choices.find(c=>c.value==='p1_')!.id);
  const r=e.view(1);expect(r.choices.some(c=>c.type==='ron')).toBe(true);
  expect(blankTableAction(r,1,false,true)).toEqual({kind:'choice',choice:r.choices.find(c=>c.type==='pass')});
 });
 it(variant+' remains inert without a native last-tile option or during results',()=>{
  const e=physicalEngine(variant,{0:'p123456789s123z2'},'z2'),g=e.view(0);
  expect(blankTableAction({...g,choices:[]},0,false,false)).toBeNull();
  expect(blankTableAction({...g,drawnTile:null,choices:[]},0,false,false)).toBeNull();
  e.respond(0,g.decisionId,g.choices.find(c=>c.type==='tsumo')!.id);expect(e.view(0).settlement).toBeTruthy();expect(blankTableAction(e.view(0),0,false,false)).toBeNull();
 });
}
for(const variant of ['sanma','yonma'] as const)it(variant+' discards the native last rack tile after a pon with no drawn tile',()=>{
 const e=physicalEngine(variant,{0:'p789s234567z1234',1:'p11s123456789z23'},'p1'),g=e.view(0);
 e.respond(0,g.decisionId,g.choices.find(c=>c.value==='p1_')!.id);
 const r=e.view(1),pon=r.choices.find(c=>c.type==='pon')!;expect(pon).toBeTruthy();e.respond(1,r.decisionId,pon.id);
 for(let seat=0;seat<(variant==='sanma'?3:4);seat++){const v=e.view(seat),p=v.choices.find(c=>c.type==='pass');if(p)e.respond(seat,v.decisionId,p.id);}
 const called=e.view(1);expect(called.drawnTile).toBeNull();
 const a=blankTableAction(called,1,false,false);expect(a?.kind).toBe('choice');
 if(a?.kind==='choice'){expect(a.choice.value).toBe(called.hand.at(-1));e.respond(1,called.decisionId,a.choice.id);expect(e.view(1).players[1].discards.length).toBe(1);}
});
