// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {currentWaits} from '@/components/mahjong/discard-waits';
import {MahjongYakumanOpportunity,yakumanWaitLevel} from '@/components/mahjong/mahjong-yakuman-opportunity';
import type {RoomView} from '@/modules/mahjong/types';
const tiles=(s:string)=>[...s.matchAll(/([mpsz])(\d+)/g)].flatMap(m=>[...m[2]].map(n=>m[1]+n));
function room(hand='m19p19s19z1234567'):RoomView{return {id:'r',code:'ABCDEFGH',hostUserId:'0',variant:'yonma',mode:'east',status:'playing',version:1,mySeat:0,members:[],game:{gameInstanceId:'instance',handId:1,decisionId:'d1',phase:'dapai',roundWind:0,roundNumber:1,honba:0,riichiSticks:0,remainingTiles:30,doraIndicators:['s9'],turnSeat:1,hand:tiles(hand),drawnTile:null,players:[0,1,2,3].map(seat=>({seat,wind:seat,score:25000,handCount:13,discards:[],melds:[],riichi:false})),choices:[],settlement:null,ranking:null}}}
const props=(r:RoomView)=>({room:r,waits:currentWaits(r.game!,0,r.variant),connected:true,canAnimate:true});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('classifies every ron/tsumo route for certainty and any route for opportunity',()=>{
 expect(yakumanWaitLevel(props(room()).waits)).toBe(2);
 expect(yakumanWaitLevel(props(room('p111222333s11z55')).waits)).toBe(1);
 expect(yakumanWaitLevel(props(room('p123456789s123z1')).waits)).toBe(0);
 expect(yakumanWaitLevel([])).toBe(0);
});
it.each([['m19p19s19z1234567','役满确定'],['p111222333s11z55','役满机会']] as const)('delays a live %s cue 600ms, expires after 3s and does not replay on redraw', (hand,label)=>{
 vi.useFakeTimers();const before=room(hand+'z7'),after=room(hand);after.game!.decisionId='d2';const v=render(<MahjongYakumanOpportunity {...props(before)}/>);
 v.rerender(<MahjongYakumanOpportunity {...props(after)}/>);act(()=>vi.advanceTimersByTime(599));expect(v.queryByRole('status')).toBeNull();
 act(()=>vi.advanceTimersByTime(1));expect(v.getByRole('status',{name:label})).toBeTruthy();
 const drawn=structuredClone(after);drawn.game!.hand.push('z7');drawn.game!.decisionId='d3';v.rerender(<MahjongYakumanOpportunity {...props(drawn)}/>);
 const repeated=structuredClone(after);repeated.game!.decisionId='d4';v.rerender(<MahjongYakumanOpportunity {...props(repeated)}/>);
 act(()=>vi.advanceTimersByTime(2999));expect(v.getByRole('status',{name:label})).toBeTruthy();act(()=>vi.advanceTimersByTime(1));expect(v.queryByRole('status')).toBeNull();
 act(()=>vi.advanceTimersByTime(3600));expect(v.queryByRole('status')).toBeNull();
});
it.each(['initial','offline','get','scope','last-tile','settlement'] as const)('never replays on %s',reason=>{
 vi.useFakeTimers();const before=room('m19p19s19z12345677'),after=room();after.game!.decisionId='d2';const v=render(<MahjongYakumanOpportunity {...props(reason==='initial'?after:before)}/>);
 const next=structuredClone(after);if(reason==='scope')next.id='new-room';if(reason==='last-tile')next.game!.remainingTiles=0;if(reason==='settlement')next.game!.settlement={kind:'draw',name:'draw',yaku:[],delta:[0,0,0,0],uraIndicators:[]};
 v.rerender(<MahjongYakumanOpportunity {...props(next)} connected={reason!=='offline'} canAnimate={reason!=='get'}/>);
 act(()=>vi.advanceTimersByTime(3600));expect(v.queryByRole('status')).toBeNull();
 v.rerender(<MahjongYakumanOpportunity {...props(next)}/>);act(()=>vi.advanceTimersByTime(3600));expect(v.queryByRole('status')).toBeNull();
});
it.each(['offline','get','scope','settlement'] as const)('cancels a pending cue on %s',reason=>{
 vi.useFakeTimers();const before=room('m19p19s19z12345677'),after=room();const v=render(<MahjongYakumanOpportunity {...props(before)}/>);v.rerender(<MahjongYakumanOpportunity {...props(after)}/>);
 const next=structuredClone(after);if(reason==='scope')next.game!.handId=2;if(reason==='settlement')next.game!.settlement={kind:'draw',name:'draw',yaku:[],delta:[0,0,0,0],uraIndicators:[]};
 v.rerender(<MahjongYakumanOpportunity {...props(next)} connected={reason!=='offline'} canAnimate={reason!=='get'}/>);act(()=>vi.advanceTimersByTime(3600));expect(v.queryByRole('status')).toBeNull();
});
it('cancels on pagehide and does not replay the next snapshot',()=>{
 vi.useFakeTimers();const before=room('m19p19s19z12345677'),after=room();const v=render(<MahjongYakumanOpportunity {...props(before)}/>);v.rerender(<MahjongYakumanOpportunity {...props(after)}/>);
 act(()=>vi.advanceTimersByTime(600));expect(v.getByRole('status',{name:'役满确定'})).toBeTruthy();act(()=>window.dispatchEvent(new Event('pagehide')));expect(v.queryByRole('status')).toBeNull();
 v.rerender(<MahjongYakumanOpportunity {...props(structuredClone(after))}/>);act(()=>vi.advanceTimersByTime(3600));expect(v.queryByRole('status')).toBeNull();
});
it('clears all pending timers on unmount',()=>{
 vi.useFakeTimers();const v=render(<MahjongYakumanOpportunity {...props(room('m19p19s19z12345677'))}/>);v.rerender(<MahjongYakumanOpportunity {...props(room())}/>);expect(vi.getTimerCount()).toBe(1);v.unmount();expect(vi.getTimerCount()).toBe(0);
});
it('does not interpret the first reconnected thirteen-tile snapshot as a live discard',()=>{
 vi.useFakeTimers();const before=room('m19p19s19z12345677'),after=room();const v=render(<MahjongYakumanOpportunity {...props(before)}/>);
 v.rerender(<MahjongYakumanOpportunity {...props(before)} connected={false}/>);v.rerender(<MahjongYakumanOpportunity {...props(after)}/>);act(()=>vi.advanceTimersByTime(3600));expect(v.queryByRole('status')).toBeNull();
});
