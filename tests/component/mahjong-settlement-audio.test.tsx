// @vitest-environment jsdom
import React,{useRef} from 'react';
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useTableAudio} from '@/components/mahjong/use-table-audio';
import {MahjongSettlementPanel} from '@/components/mahjong/mahjong-settlement-panel';
import {SettlementSequenceGame} from '@/modules/mahjong/settlement-sequence';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {RoomView} from '@/modules/mahjong/types';
const audio=vi.hoisted(()=>({play:vi.fn(),unlock:vi.fn(async()=>true),setEnabled:vi.fn(),pause:vi.fn(),cancel:vi.fn(),dispose:vi.fn()}));
vi.mock('@/components/mahjong/table-audio',()=>({TableAudioPlayer:class{play=audio.play;unlock=audio.unlock;setEnabled=audio.setEnabled;pause=audio.pause;cancel=audio.cancel;dispose=audio.dispose;}}));
function fixture(variant:'sanma'|'yonma'){
 const native=physicalEngine(variant,{0:variant==='sanma'?'p123456s123z5552':'m123p123s123z1112'},'z2');
 const wrap=(game:RoomView['game'],version:number):RoomView=>({id:'sound',code:'ABCDEFGH',hostUserId:'0',mode:'east',variant,status:'playing',version,mySeat:0,game,members:[]});
 const before=wrap(native.view(0),1),turn=native.view(0),choice=turn.choices.find(c=>c.type==='tsumo')!;native.respond(0,turn.decisionId,choice.id);
 const sequence=new SettlementSequenceGame(native,variant==='sanma'?3:4,{now:()=>0}),detail=wrap(sequence.view(0),2);
 const scores=()=>{const g=sequence.view(0);sequence.respond(0,g.decisionId,'ack');return wrap(sequence.view(0),3);};
 return {before,detail,scores};
}
function Harness({room,connected=true,canAnimate=true,visual=true}:{room:RoomView;connected?:boolean;canAnimate?:boolean;visual?:boolean}){
 const ref=useRef<HTMLElement>(null),sound=useTableAudio({room,connected,canAnimate,rootRef:ref});
 return <main ref={ref}><button onClick={sound.toggle}>切换声音</button>{visual&&room.game?<MahjongSettlementPanel game={room.game} room={room} connected={connected} busy={false} onChoice={()=>{}}/>:null}</main>;
}
beforeEach(()=>{vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance','requestAnimationFrame','cancelAnimationFrame']});vi.clearAllMocks();audio.play.mockReset();localStorage.clear();vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
const advance=(ms:number)=>act(()=>vi.advanceTimersByTime(ms));
it.each(['sanma','yonma'] as const)('sounds real %s revealed yaku, value and the single table score roll once',variant=>{
 const f=fixture(variant),v=render(<Harness room={f.before}/>);v.rerender(<Harness room={f.detail}/>);
 advance(1499);expect(audio.play).not.toHaveBeenCalled();advance(1);advance(16);
 expect(v.container.querySelector('.is-detail li.is-revealed')).toBeTruthy();expect(audio.play.mock.calls.map(c=>c[0].kind)).toEqual(['yaku']);
 const count=Math.min(15,f.detail.game!.settlement!.yaku.length);
 for(let i=1;i<count;i++){advance(164);advance(16);}
 advance(164);advance(16);
 expect(v.container.querySelector('.mahjong-settlement-panel__value.is-revealed')).toBeTruthy();expect(audio.play.mock.calls.map(c=>c[0].kind)).toEqual([...Array(count).fill('yaku'),'hand-value']);
 const scores=f.scores();v.rerender(<Harness room={scores}/>);advance(1199);expect(audio.play).toHaveBeenCalledTimes(count+1);advance(1);advance(16);
 expect(audio.play.mock.calls.at(-1)![0].kind).toBe('score-roll');expect(audio.play.mock.calls.at(-1)![1]).toBeGreaterThanOrEqual(0);
 v.rerender(<Harness room={structuredClone(scores)}/>);advance(3000);expect(audio.play).toHaveBeenCalledTimes(count+2);
});
it.each(['mute','offline','get','resize','background','unmount','no-visual'] as const)('cancels result cues after %s and never catches up',reason=>{
 const f=fixture('yonma'),v=render(<Harness room={f.before}/>);v.rerender(<Harness room={f.detail} visual={reason!=='no-visual'}/>);advance(100);
 if(reason==='mute'){fireEvent.click(v.getByRole('button',{name:'切换声音'}));fireEvent.click(v.getByRole('button',{name:'切换声音'}));}
 if(reason==='offline'){v.rerender(<Harness room={f.detail} connected={false}/>);v.rerender(<Harness room={f.detail}/>);}
 if(reason==='get'){v.rerender(<Harness room={f.detail} canAnimate={false}/>);v.rerender(<Harness room={f.detail}/>);}
 if(reason==='resize')act(()=>window.dispatchEvent(new Event('resize')));
 if(reason==='background')act(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 if(reason==='unmount')v.unmount();
 advance(6000);expect(audio.play).not.toHaveBeenCalled();
});
it('does not replay detail audio on initial mount or after a late join',()=>{
 const f=fixture('sanma'),v=render(<Harness room={f.detail}/>);advance(5000);expect(audio.play).not.toHaveBeenCalled();v.unmount();
 const late=structuredClone(f.detail);late.game!.settlementFlow!.elapsedMs=1500;const w=render(<Harness room={f.before}/>);w.rerender(<Harness room={late}/>);advance(5000);expect(audio.play).not.toHaveBeenCalled();
});
it('discards an obsolete detail cue even if the next phase also has matching DOM markers',()=>{
 const f=fixture('yonma'),v=render(<Harness room={f.before}/>);v.rerender(<Harness room={f.detail}/>);advance(100);v.rerender(<Harness room={f.scores()}/>);advance(1200);advance(16);
 expect(audio.play.mock.calls.map(c=>c[0].kind)).toEqual(['score-roll']);advance(4000);expect(audio.play).toHaveBeenCalledOnce();
});
it('trims a score roll that waits for the actual DOM rather than replaying the completed prefix',()=>{
 const f=fixture('yonma'),v=render(<Harness room={f.detail}/>),scores=f.scores();v.rerender(<Harness room={scores} visual={false}/>);advance(2000);expect(audio.play).not.toHaveBeenCalled();
 v.rerender(<Harness room={scores}/>);advance(32);expect(audio.play).toHaveBeenCalledOnce();expect(audio.play.mock.calls[0][0].kind).toBe('score-roll');expect(audio.play.mock.calls[0][1]).toBeGreaterThanOrEqual(.8);expect(audio.play.mock.calls[0][1]).toBeLessThan(.99);
});
it('never sounds a score roll when reduced motion shows the final scores immediately',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:()=>{},removeEventListener:()=>{}}));
 const f=fixture('sanma'),v=render(<Harness room={f.detail}/>);v.rerender(<Harness room={f.scores()}/>);advance(4000);expect(audio.play).not.toHaveBeenCalled();
});
