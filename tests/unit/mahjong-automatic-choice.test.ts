import {describe,it,expect} from 'vitest';
import {automaticChoice,automaticOff} from '@/components/mahjong/automatic-choice';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import {northReplacementFixture} from '../fixtures/mahjong-view-game';
import type {GameView,Choice} from '@/modules/mahjong/types';
const all={win:true,noCalls:true,drawnDiscard:true,north:true};
for(const variant of ['sanma','yonma'] as const)describe(variant+' automatic legal decisions',()=>{
 it('only selects native tsumo when enabled and settles through the real engine',()=>{
  const engine=physicalEngine(variant,{0:'p123456789s123z2'},'z2'),g=engine.view(0);
  expect(automaticChoice(g,automaticOff)).toBeNull();expect(automaticChoice(g,{...all,win:false})).toBeNull();
  const c=automaticChoice(g,all)!;expect(c.type).toBe('tsumo');engine.respond(0,g.decisionId,c.id);expect(engine.view(0).settlement?.winMethod).toBe('tsumo');
 });
 it('selects the physical drawn tile rather than another identical tile',()=>{
  const engine=physicalEngine(variant,{0:'p123456789s124z2'},'s2'),g=engine.view(0);
  expect(g.choices.every(c=>c.type==='discard')).toBe(true);const c=automaticChoice(g,all)!;expect(c.value).toBe('s2_');engine.respond(0,g.decisionId,c.id);expect(engine.view(0).players[0].discards.at(-1)).toContain('s2_');
 });
 it('never discards past an offered riichi or special self operation',()=>{
  const engine=physicalEngine(variant,{0:'p123456789s123z2'},'z3'),g=engine.view(0);expect(g.choices.some(c=>c.type==='riichi')).toBe(true);expect(automaticChoice(g,all)).toBeNull();
 });
 it('executes pass against an actual offered pon',()=>{
  const engine=physicalEngine(variant,{0:'p789s234567z1234',1:'p11s123456789z23'},'p1'),g=engine.view(0);engine.respond(0,g.decisionId,g.choices.find(c=>c.value==='p1_')!.id);
  const response=engine.view(1);expect(response.choices.some(c=>c.type==='pon')).toBe(true);expect(response.choices.some(c=>c.type==='ron')).toBe(false);const pass=automaticChoice(response,all)!;expect(pass.type).toBe('pass');engine.respond(1,response.decisionId,pass.id);expect(engine.view(1).players[1].melds).toEqual([]);
 });
 it('passes native calls but does not pass a legal ron',()=>{
  const engine=physicalEngine(variant,{0:'p789s234567z1234',1:'p1123456789s123'},'p1'),g=engine.view(0);const cut=g.choices.find(c=>c.type==='discard'&&c.value==='p1_')!;engine.respond(0,g.decisionId,cut.id);
  const response=engine.view(1);expect(response.choices.some(c=>c.type==='ron')).toBe(true);expect(automaticChoice(response,{...all,win:false})).toBeNull();const win=automaticChoice(response,all)!;expect(win.type).toBe('ron');engine.respond(1,response.decisionId,win.id);
 });
});
it('extracts an offered north and preserves visible north count through replacement',()=>{
 const e=physicalEngine('sanma',{0:'p123456789s124z2'},'z4'),g=e.view(0),c=automaticChoice(g,all)!;expect(c.type).toBe('nuki');e.respond(0,g.decisionId,c.id);expect(e.view(0).players[0].nuki).toBe(1);
});
it('does not auto-extract north when another self operation is available',()=>{
 const g=northReplacementFixture().view(0);const view={...g,choices:[...g.choices,{id:'kan:test',type:'kan'} as Choice]};expect(automaticChoice(view,all)).toBeNull();
});
it('passes only calls, not acknowledgments or self kan',()=>{
 const g=physicalEngine('yonma',{0:'p123456789s124z2'},'s2').view(0);
 for(const type of ['chi','pon','kan'] as const)expect(automaticChoice({...g,choices:[{id:'call',type},{id:'pass',type:'pass'}]},all)?.type).toBe('pass');
 expect(automaticChoice({...g,choices:[...g.choices,{id:'kan',type:'kan'}]},all)).toBeNull();
 expect(automaticChoice({...g,choices:[{id:'ack',type:'ack'}]},all)).toBeNull();
 expect(automaticChoice({...g,settlement:{} as GameView['settlement']},all)).toBeNull();
});

for(const variant of ['sanma','yonma'] as const){
 it(variant+' automatic cut selects the displayed opening last native hand tile',()=>{
  const engine=physicalEngine(variant,{0:'p23887654s421z22'},'p1'),g=engine.view(0);
  const c=automaticChoice(g,all,'z2')!;expect(c.value).toBe('z2');
  engine.respond(0,g.decisionId,c.id);expect(engine.view(0).players[0].discards.at(-1)).toBe('z2');
 });
 it(variant+' rejects an unavailable displayed cut without inventing draw flags',()=>{
  const g=physicalEngine(variant,{0:'p23887654s421z22'},'p1').view(0);
  expect(automaticChoice(g,all,'z2_')).toBeNull();expect(automaticChoice(g,all,'m8')).toBeNull();
  expect(automaticChoice(g,{...all,drawnDiscard:false},'z2')).toBeNull();
  expect(automaticChoice({...g,drawnTile:null},all,'z2')).toBeNull();
 });
}
