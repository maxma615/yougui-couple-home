import {expect,it} from 'vitest';
import {currentWaits,discardWaits,singleDiscardWaits} from '@/components/mahjong/discard-waits';
import type {GameView} from '@/modules/mahjong/types';
const shapes=(waits:ReturnType<typeof discardWaits>)=>waits.map(({tile,remaining})=>({tile,remaining}));
const tiles=(s:string)=>[...s.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>m[1]+n));
function view(hand='p123456789s123z11'):GameView{return {decisionId:'d',phase:'zimo',roundWind:0,roundNumber:1,honba:0,riichiSticks:0,remainingTiles:30,doraIndicators:['z7'],turnSeat:0,hand:tiles(hand),drawnTile:'z1',players:[0,1,2,3].map(seat=>({seat,wind:seat,score:25000,handCount:13,discards:[],melds:[],riichi:false})),choices:[{id:'d:z1',type:'discard',value:'z1_'},{id:'r:z1',type:'riichi',value:'z1_'}],settlement:null,ranking:null}}
it('previews only offered discards and preserves the view',()=>{const g=view(),before=structuredClone(g);expect(shapes(discardWaits(g,0,'yonma','d:z1'))).toEqual([{tile:'z1',remaining:2}]);expect(shapes(discardWaits(g,0,'yonma','r:z1'))).toEqual([{tile:'z1',remaining:2}]);expect(g).toEqual(before);expect(shapes(discardWaits(g,0,'yonma','unknown'))).toEqual([])});
it('does not mistake shape waits for an available live-wall count',()=>{const g=view();g.players[1].discards=['z1'];g.players[2].discards=['z1*'];expect(shapes(discardWaits(g,0,'yonma','d:z1'))).toEqual([{tile:'z1',remaining:0}])});
it('counts a called chi tile once through its meld using a conserved visible tile count',()=>{const g=view('p123s123456789p1z2');g.choices=[{id:'z2',type:'discard',value:'z2'}];g.players[1].discards=['p1-'];g.players[2].melds=['p1-23'];expect(discardWaits(g,0,'yonma','z2').find(w=>w.tile==='p1')?.remaining).toBe(1)});
it('handles an open hand and a closed kan without changing their shape',()=>{for(const meld of ['p111-','p1111']){const g=view('s123456789z11');g.players[0].melds=[meld];expect(shapes(discardWaits(g,0,'yonma','d:z1'))).toEqual([{tile:'z1',remaining:2}])}});
it('normalizes exposed red fives and counts dora indicators',()=>{const g=view('p123456789s123p55');g.choices=[{id:'red',type:'discard',value:'p5'}];g.players[1].discards=['p0'];g.doraIndicators=['z7'];expect(discardWaits(g,0,'yonma','red').find(w=>w.tile==='p5')?.remaining).toBe(0)});
it('filters absent middle manzu in three-player waits',()=>{const g=view('p123456789s123m23');g.choices=[{id:'m3',type:'discard',value:'m3'}];expect(shapes(discardWaits(g,0,'yonma','m3'))).toEqual([{tile:'m2',remaining:3}]);expect(shapes(discardWaits(g,0,'sanma','m3'))).toEqual([])});
it('counts extracted north as public physical tiles',()=>{const g=view('p123456789s123z44');g.choices=[{id:'north',type:'discard',value:'z4'}];g.players[1].nuki=2;expect(shapes(discardWaits(g,0,'sanma','north'))).toEqual([{tile:'z4',remaining:0}])});
it('returns no preview for non-tenpai, invalid shape, results or another seat',()=>{const g=view('p147s258m369z12345');expect(shapes(discardWaits(g,0,'yonma','d:z1'))).toEqual([]);g.settlement={kind:'draw',name:'荒牌',yaku:[],delta:[0,0,0,0],uraIndicators:[]};expect(shapes(discardWaits(g,0,'yonma','d:z1'))).toEqual([]);expect(shapes(discardWaits(view(),9,'yonma','d:z1'))).toEqual([])});
it('marks ron without yaku separately from a closed-hand tsumo yaku',()=>{const g=view('m123p123s456789z11');const w=discardWaits(g,0,'yonma','d:z1')[0];expect(w).toMatchObject({ronYaku:false,tsumoYaku:true,furiten:true})});
it('does not let bonus tiles establish a yaku in an open hand',()=>{const g=view('p123s456789z11');g.players[0].melds=['m123-'];g.doraIndicators=['p9'];expect(discardWaits(g,0,'yonma','d:z1')[0]).toMatchObject({ronYaku:false,tsumoYaku:false})});
it('a legal riichi discard establishes a yaku, but still retains discard furiten',()=>{const g=view('m123p123s456789z11');expect(discardWaits(g,0,'yonma','r:z1')[0]).toMatchObject({ronYaku:true,tsumoYaku:true,furiten:true})});
it('a different discard can create a non-furiten wait, while every historical own discard remains relevant',()=>{const g=view('m123p123s456789z12');g.choices=[{id:'z2',type:'discard',value:'z2'}];expect(discardWaits(g,0,'yonma','z2')[0]).toMatchObject({tile:'z1',furiten:false});g.players[0].discards=['z1-'];expect(discardWaits(g,0,'yonma','z2')[0].furiten).toBe(true)});
it('passed-ron blockage persists after a riichi discard, but ordinary own discard resets temporary blockage',()=>{const g=view('m123p123s456789z12');g.choices=[{id:'z2',type:'discard',value:'z2'}];Object.assign(g,{ronBlocked:true});expect(discardWaits(g,0,'yonma','z2')[0].furiten).toBe(false);g.players[0].riichi=true;expect(discardWaits(g,0,'yonma','z2')[0].furiten).toBe(true)});
it('counts an exposed indicator without inventing a fifth tile',()=>{const g=view();g.doraIndicators=['z1'];expect(discardWaits(g,0,'yonma','d:z1')[0].remaining).toBe(1)});
it('all thirteen orphan waits share permanent furiten after discarding one of those waits',()=>{const g=view('m119p19s19z1234567');g.choices=[{id:'m1',type:'discard',value:'m1'}];const result=discardWaits(g,0,'sanma','m1');expect(result).toHaveLength(13);expect(result.every(w=>w.furiten&&w.ronYaku&&w.tsumoYaku)).toBe(true)});

it('current thirteen-tile waits need no discard choice and preserve current temporary furiten',()=>{
 const g=view('m123p123s456789z1');g.drawnTile=null;g.choices=[];g.turnSeat=1;
 expect(currentWaits(g,0,'yonma')[0]).toMatchObject({tile:'z1',remaining:3,ronYaku:false,tsumoYaku:true,furiten:false});
 g.ronBlocked=true;expect(currentWaits(g,0,'yonma')[0].furiten).toBe(true);
 g.ronBlocked=false;g.players[0].discards=['z1-'];expect(currentWaits(g,0,'yonma')[0].furiten).toBe(true);
});
it('current open and closed-kan waits count public tiles without mutating the view',()=>{
 for(const meld of ['p111-','p1111']){const g=view('s123456789z4');g.players[0].melds=[meld];g.players[1].nuki=2;g.drawnTile=null;g.choices=[];
 const before=structuredClone(g);expect(currentWaits(g,0,'sanma')[0]).toMatchObject({tile:'z4',remaining:1});expect(g).toEqual(before);}
});
it('current wait entry is absent for fourteen tiles, non-tenpai and finished hands',()=>{
 expect(currentWaits(view(),0,'yonma')).toEqual([]);
 const g=view('p147s258m369z1234');expect(currentWaits(g,0,'yonma')).toEqual([]);
 const ready=view('p123456789s123z1');ready.settlement={kind:'draw',name:'荒牌',yaku:[],delta:[0,0,0,0],uraIndicators:[]};expect(currentWaits(ready,0,'yonma')).toEqual([]);
});

it('finds the single tenpai discard among a full set of offered cuts without mutating the view',()=>{
 const g=view('p123456789s12z117');g.drawnTile='z7';g.choices=g.hand.map((tile,i)=>({id:'c'+i,type:'discard',value:tile+(i===13?'_':'')}));const before=structuredClone(g);
 expect(singleDiscardWaits(g,0,'yonma')).toEqual(discardWaits(g,0,'yonma','c13'));expect(singleDiscardWaits(g,0,'yonma')[0]).toMatchObject({tile:'s3',remaining:4,ronYaku:true,furiten:false});expect(g).toEqual(before);
});
it('counts duplicate physical tile choices once and keeps red five distinct from ordinary five',()=>{
 const g=view();g.choices=[{id:'hand',type:'discard',value:'z1'},{id:'drawn',type:'discard',value:'z1_'}];expect(singleDiscardWaits(g,0,'yonma')).toHaveLength(1);
 const red=view('p123456789s123p05');red.choices=[{id:'red',type:'discard',value:'p0'},{id:'normal',type:'discard',value:'p5'}];expect(singleDiscardWaits(red,0,'yonma')).toEqual([]);
});
it('omits the peek for multiple tenpai cuts or none, and follows authorized riichi choices only',()=>{
 const g=view('p123456789s123z12');g.choices=[{id:'east',type:'discard',value:'z1'},{id:'south',type:'discard',value:'z2'},{id:'r',type:'riichi',value:'z2'}];expect(singleDiscardWaits(g,0,'yonma')).toEqual([]);expect(singleDiscardWaits(g,0,'yonma','riichi')[0]).toMatchObject({tile:'z1',ronYaku:true});
 g.choices=[{id:'pass',type:'pass'}];expect(singleDiscardWaits(g,0,'yonma')).toEqual([]);g.choices=[{id:'absent',type:'discard',value:'z7'}];expect(singleDiscardWaits(g,0,'yonma')).toEqual([]);
});
