import assert from 'node:assert/strict';
import {abortPhysicalEngine as physicalEngine} from '../fixtures/mahjong-abort-game';
import {it, expect} from 'vitest';
import {SettlementSequenceGame} from '../../src/modules/mahjong/settlement-sequence';
import type {MahjongGame} from '../../src/modules/mahjong/types';
function choose(game:MahjongGame,seat:number,type:string,value?:string){const v=game.view(seat),c=v.choices.find(c=>c.type===type&&(value===undefined||c.value===value));assert.ok(c,`${seat} ${type} ${value}: ${JSON.stringify(v.choices)}`);game.respond(seat,v.decisionId,c.id);}
function pass(game:MahjongGame){for(let i=0;i<20;i++){let acted=false;for(let seat=0;seat<game.view(0).players.length;seat++)if(game.view(seat).choices.some(c=>c.type==='pass')){choose(game,seat,'pass');acted=true;break;}if(!acted)return;}throw Error('pass bound');}
it("native abort metadata follows the actual public declarations", () => {
const cases=[];
{
 const game=physicalEngine('yonma',{0:'m19p147s258z13567',1:'m19p258s147z12367',2:'m19p369s369z12457',3:'m2346p3468s2468z1'},'z4');
 for(let seat=0;seat<4;seat++){choose(game,seat,'discard','z1');pass(game);}
 assert.equal(game.view(0).settlement?.name,'四風連打');assert.deepEqual(game.view(0).settlement?.drawInfo?.revealedHands,[]);cases.push({kind:'four-winds',result:game.view(0).settlement});
}
{
 const game=physicalEngine('yonma',{0:'m123456789p111z1',1:'p123456789s111z2',2:'s123456789m111z3',3:'m222333p222333z4'},'z5');
 for(let seat=0;seat<4;seat++){choose(game,seat,'riichi');pass(game);}
 expect(game.view(0).settlement?.drawInfo).toHaveProperty('abortPresentation', {riichiSeat:3,ronSeats:[]});
 assert.equal(game.view(0).settlement?.name,'四家立直');assert.equal(game.view(0).settlement?.drawInfo?.revealedHands.length,4);cases.push({kind:'four-riichi',result:game.view(0).settlement,sticks:game.view(0).riichiSticks,players:game.view(0).players});
}
{
 const game=physicalEngine('yonma',{1:'p123456789s123z3',2:'m123456789s456z3',3:'p111s222333444z3'},'z3');
 choose(game,0,'discard','z3_');for(let seat=1;seat<4;seat++)choose(game,seat,'ron');
 expect(game.view(0).settlement?.drawInfo).toHaveProperty('abortPresentation', {ronSeats:[1,2,3]});
 assert.equal(game.view(0).settlement?.name,'三家和');assert.deepEqual(game.view(0).settlement?.drawInfo?.revealedHands.map(h=>h.seat),[1,2,3]);cases.push({kind:'triple-ron',result:game.view(0).settlement});
}
{
 const game=physicalEngine('yonma',{0:'m1111p1111s1111z1',1:'m2222p234s234z234'},'p9');
 for(const value of ['m1111','p1111','s1111']){choose(game,0,'kan',value);pass(game);}
 const v=game.view(0),c=v.choices.find(c=>c.type==='discard'&&c.value?.endsWith('_'));assert.ok(c);choose(game,0,'discard',c.value);pass(game);
 choose(game,1,'kan','m2222');pass(game);
 const w=game.view(1),d=w.choices.find(c=>c.type==='discard'&&c.value?.endsWith('_'));assert.ok(d);choose(game,1,'discard',d.value);pass(game);
 assert.equal(game.view(0).settlement?.name,'四開槓');assert.deepEqual(game.view(0).settlement?.drawInfo?.revealedHands,[]);cases.push({kind:'four-kans',result:game.view(0).settlement,indicators:game.view(0).doraIndicators});
}
for (const entry of cases) expect(entry.result?.delta).toEqual([0,0,0,0]);
});

it("sanma four kans keep the original zero payment and hidden hands", () => {
 const game=physicalEngine('sanma',{0:'p1111s1111z2222z3',1:'p2222s234567z445'},'p9');
 for(const value of ['p1111','s1111','z2222']) { choose(game,0,'kan',value); pass(game); }
 const discardDrawn=(seat:number)=>{const c=game.view(seat).choices.find(c=>c.type==='discard'&&c.value?.endsWith('_'));assert.ok(c);choose(game,seat,'discard',c.value);pass(game);};
 discardDrawn(0);choose(game,1,'kan','p2222');pass(game);discardDrawn(1);
 const v=game.view(0);
 expect(v.settlement?.name).toBe('四開槓');
 expect(v.settlement?.drawInfo?.revealedHands).toEqual([]);
 expect(v.settlement?.drawInfo?.abortPresentation).toEqual({ronSeats:[]});
 expect(v.settlement?.delta).toEqual([0,0,0]);
});

for (const dealer of [1,2,3]) it(`four riichi maps public metadata after dealer rotation ${dealer}`, () => {
 const game=physicalEngine('yonma',{0:'m123456789p111z1',1:'p123456789s111z2',2:'s123456789m111z3',3:'m222333p222333z4'},'z5',dealer);
 for(let wind=0;wind<4;wind++){choose(game,(dealer+wind)%4,'riichi');pass(game);}
 const v=game.view(0);
 expect(v.settlement?.drawInfo?.abortPresentation).toEqual({riichiSeat:(dealer+3)%4,ronSeats:[]});
 expect(v.settlement?.drawInfo?.revealedHands.map(h=>h.seat)).toEqual([0,1,2,3].map(w=>(dealer+w)%4));
 expect(v.players.map(p=>p.score)).toEqual([24000,24000,24000,24000]);
 expect(v.riichiSticks).toBe(4);
 v.settlement!.drawInfo!.abortPresentation!.ronSeats.push(0);
 expect(game.view(0).settlement?.drawInfo?.abortPresentation?.ronSeats).toEqual([]);
});

for (const dealer of [0,1,2,3]) it(`triple ron interrupts riichi without charging a deposit at dealer ${dealer}`, () => {
 const game=physicalEngine('yonma',{0:'m123456789z1112',1:'p123456789s123z3',2:'m123456789s456z3',3:'p111s222333444z3'},'z3',dealer);
 choose(game,dealer,'riichi','z3_');
 for(let wind=1;wind<4;wind++)choose(game,(dealer+wind)%4,'ron');
 const v=game.view(dealer);
 expect(v.settlement?.name).toBe('三家和');
 expect(v.settlement?.drawInfo?.abortPresentation).toEqual({riichiSeat:dealer,ronSeats:[1,2,3].map(w=>(dealer+w)%4)});
 expect(v.settlement?.drawInfo?.revealedHands.some(h=>h.seat===dealer)).toBe(false);
 expect(v.players.map(p=>p.score)).toEqual([25000,25000,25000,25000]);
 expect(v.riichiSticks).toBe(0);
 expect(v.settlement?.delta).toEqual([0,0,0,0]);
});

for(const variant of ['sanma','yonma'] as const) it(`${variant} riichi before four-kans retains the native deposit and waits for every ACK`, () => {
 const count=variant==='sanma'?3:4;
 const raw=physicalEngine(variant,variant==='sanma'?{0:'p1111s1111z2222z3',1:'p2222s234567z111'}:{0:'m1111p1111s1111z1',1:'m2222p234s234z111'},'p9');
 for(const value of variant==='sanma'?['p1111','s1111','z2222']:['m1111','p1111','s1111']){choose(raw,0,'kan',value);pass(raw);}
 choose(raw,0,'discard',raw.view(0).choices.find(c=>c.type==='discard'&&c.value?.endsWith('_'))!.value);pass(raw);
 choose(raw,1,'kan',variant==='sanma'?'p2222':'m2222');pass(raw);choose(raw,1,'riichi');pass(raw);
 const game=new SettlementSequenceGame(raw,count),ending=game.view(0);
 expect(ending.settlement?.name).toBe('四開槓');
 expect(ending.settlement?.drawInfo?.abortPresentation).toEqual({riichiSeat:1,ronSeats:[]});
 expect(ending.settlement?.drawInfo?.revealedHands).toEqual([]);
 expect(ending.riichiSticks).toBe(1);
 expect(ending.players.find(p=>p.seat===1)?.score).toBe(variant==='sanma'?34000:24000);
 for(let seat=0;seat<count-1;seat++){
   choose(game,seat,'ack');
   expect(game.view(seat).choices).toEqual([]);
   expect(game.view(seat).handId).toBe(ending.handId);
   expect(game.view(count-1).settlementFlow?.stage).toBe('draw');
 }
 expect(()=>game.respond(0,ending.decisionId,'ack')).toThrow();
 choose(game,count-1,'ack');
 expect(game.view(0).handId).toBe(ending.handId!+1);
 expect(game.view(0).honba).toBe(1);
 expect(game.view(0).riichiSticks).toBe(1);
});
for(const variant of ['sanma','yonma'] as const) it(`${variant} nine terminals only publishes the declaring seat`, () => {
 const raw=physicalEngine(variant,{0:'m19p19s19z1234567'},'z1');choose(raw,0,'abort');
 const v=raw.view(1);
 expect(v.settlement?.drawInfo?.abortPresentation).toEqual({ronSeats:[]});
 expect(v.settlement?.drawInfo?.revealedHands.map(h=>h.seat)).toEqual([0]);
 expect(v.settlement?.drawInfo?.revealedHands[0].waits).toEqual([]);
 expect(v.settlement?.delta).toEqual(Array(v.players.length).fill(0));
});
it('nine terminals does not reuse the previous player riichi declaration', () => {
 const game=physicalEngine('yonma',{0:'m123456789p111z2',1:'m19p19s19z1234567'},'z3');
 choose(game,0,'riichi','z3_');pass(game);choose(game,1,'abort');
 expect(game.view(0).settlement?.name).toBe('九種九牌');
 expect(game.view(0).settlement?.drawInfo?.abortPresentation).toEqual({ronSeats:[]});
 expect(game.view(0).settlement?.drawInfo?.revealedHands.map(h=>h.seat)).toEqual([1]);
});
