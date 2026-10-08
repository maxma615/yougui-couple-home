// @vitest-environment jsdom
import React,{useRef} from 'react';
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useTableAudio} from '@/components/mahjong/use-table-audio';
import {MahjongFinalRanking} from '@/components/mahjong/mahjong-final-ranking';
import {rankingPair} from '../fixtures/mahjong-ranking-game';
import type {RoomView} from '@/modules/mahjong/types';
const audio=vi.hoisted(()=>({play:vi.fn(),unlock:vi.fn(async()=>true),setEnabled:vi.fn(),pause:vi.fn(),cancel:vi.fn(),dispose:vi.fn()}));
vi.mock('@/components/mahjong/table-audio',()=>({TableAudioPlayer:class{play=audio.play;unlock=audio.unlock;setEnabled=audio.setEnabled;pause=audio.pause;cancel=audio.cancel;dispose=audio.dispose;}}));
function Harness({room,live=true,connected=true,visual=true}:{room:RoomView;live?:boolean;connected?:boolean;visual?:boolean}){
 const ref=useRef<HTMLElement>(null),sound=useTableAudio({room,connected,canAnimate:live,rootRef:ref});
 return <main ref={ref}><button onClick={sound.toggle}>切换声音</button>{visual&&room.game?.ranking?<MahjongFinalRanking ranking={room.game.ranking} flow={room.game.rankingFlow} members={room.members} ownSeat={room.mySeat??0} host connected={connected} busy={false} onRematch={()=>{}} onFinish={()=>{}}/>:null}</main>;
}
beforeEach(()=>{vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance','requestAnimationFrame','cancelAnimationFrame']});vi.clearAllMocks();localStorage.clear();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(()=>{cleanup();vi.useRealTimers();});
const advance=(ms:number)=>act(()=>vi.advanceTimersByTime(ms));
it.each(['sanma','yonma'] as const)('sounds actual %s native final rows only after reveal and once',variant=>{
 const f=rankingPair(variant),v=render(<Harness room={f.before}/>);v.rerender(<Harness room={f.after}/>);advance(1799);expect(audio.play).not.toHaveBeenCalled();advance(1);advance(16);
 expect(v.container.querySelectorAll('[data-ranking-visible="true"]')).toHaveLength(1);expect(audio.play.mock.calls.map(c=>c[0].kind)).toEqual(['rank-first']);
 for(let index=1;index<f.after.game!.ranking!.length;index++){advance(784);advance(16);expect(audio.play).toHaveBeenCalledTimes(index+1);expect(audio.play.mock.calls[index][0].kind).toBe('rank-row');}
 v.rerender(<Harness room={structuredClone(f.after)}/>);advance(5000);expect(audio.play).toHaveBeenCalledTimes(f.after.game!.ranking!.length);
});
it.each(['mute','offline','get','resize','background','unmount','missing-visual'] as const)('drops final row sound after %s',mode=>{
 const f=rankingPair('sanma'),v=render(<Harness room={f.before}/>);v.rerender(<Harness room={f.after} visual={mode!=='missing-visual'}/>);advance(100);
 if(mode==='mute'){fireEvent.click(v.getByRole('button',{name:'切换声音'}));fireEvent.click(v.getByRole('button',{name:'切换声音'}));}
 if(mode==='offline'){v.rerender(<Harness room={f.after} connected={false}/>);v.rerender(<Harness room={f.after}/>);}
 if(mode==='get'){v.rerender(<Harness room={f.after} live={false}/>);v.rerender(<Harness room={f.after}/>);}
 if(mode==='resize')act(()=>window.dispatchEvent(new Event('resize')));
 if(mode==='background')act(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 if(mode==='unmount')v.unmount();advance(6000);expect(audio.play).not.toHaveBeenCalled();
});
it('does not catch up a first, late or missed final snapshot',()=>{
 const f=rankingPair('yonma'),v=render(<Harness room={f.after}/>);advance(6000);expect(audio.play).not.toHaveBeenCalled();v.unmount();f.advance(1800);
 const late=render(<Harness room={f.before}/>);late.rerender(<Harness room={f.view()}/>);advance(6000);expect(audio.play).not.toHaveBeenCalled();late.unmount();
 const missed=structuredClone(f.after);missed.version++;const w=render(<Harness room={f.before}/>);w.rerender(<Harness room={missed}/>);advance(6000);expect(audio.play).not.toHaveBeenCalled();
});
it('mute after the first visible rank cancels the later rows',()=>{
 const f=rankingPair('yonma'),v=render(<Harness room={f.before}/>);v.rerender(<Harness room={f.after}/>);advance(1800);advance(16);expect(audio.play).toHaveBeenCalledOnce();
 fireEvent.click(v.getByRole('button',{name:'切换声音'}));advance(5000);expect(audio.play).toHaveBeenCalledOnce();
});
it('a new lobby invalidates queued final ranking sounds',()=>{
 const f=rankingPair('sanma'),v=render(<Harness room={f.before}/>);v.rerender(<Harness room={f.after}/>);advance(100);
 v.rerender(<Harness room={{...f.after,status:'lobby',game:null,version:f.after.version+1}}/>);advance(6000);expect(audio.play).not.toHaveBeenCalled();expect(audio.cancel).toHaveBeenCalled();
});
