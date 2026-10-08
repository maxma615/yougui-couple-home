// @vitest-environment jsdom
import React,{useRef} from 'react';
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useTableAudio} from '@/components/mahjong/use-table-audio';
import {MahjongDeclarations} from '@/components/mahjong/mahjong-declarations';
import {declarationPair} from '../fixtures/mahjong-declaration-game';
import type {RoomView} from '@/modules/mahjong/types';
const audio=vi.hoisted(()=>({play:vi.fn(),unlock:vi.fn(async()=>true),setEnabled:vi.fn(),pause:vi.fn(),cancel:vi.fn(),dispose:vi.fn()}));
vi.mock('@/components/mahjong/table-audio',()=>({TableAudioPlayer:class{play=audio.play;unlock=audio.unlock;setEnabled=audio.setEnabled;pause=audio.pause;cancel=audio.cancel;dispose=audio.dispose;}}));
function Harness({room,connected=true,canAnimate=true,visual=true}:{room:RoomView;connected?:boolean;canAnimate?:boolean;visual?:boolean}){
 const ref=useRef<HTMLElement>(null),sound=useTableAudio({room,connected,canAnimate,rootRef:ref});
 return <main ref={ref}><button onClick={sound.toggle}>切换声音</button>{visual?<MahjongDeclarations room={room} connected={connected} canAnimate={canAnimate} ownSeat={0}/>:null}</main>;
}
beforeEach(()=>{vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance','requestAnimationFrame','cancelAnimationFrame']});vi.clearAllMocks();localStorage.clear();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(()=>{cleanup();vi.useRealTimers();});
const advance=(ms:number)=>act(()=>vi.advanceTimersByTime(ms));
it('sounds both ron declarations only after their actual desk markers appear',()=>{
 const {before,after}=declarationPair('yonma','ron'),v=render(<Harness room={before}/>);
 v.rerender(<Harness room={after}/>);advance(299);expect(audio.play).not.toHaveBeenCalled();
 advance(1);advance(16);expect(audio.play.mock.calls.map(c=>c[0].kind)).toEqual(['ron']);
 advance(30);expect(audio.play.mock.calls.map(c=>[c[0].kind,c[0].seat])).toEqual([['ron',1],['ron',2]]);
 v.rerender(<Harness room={structuredClone(after)}/>);advance(1500);expect(audio.play).toHaveBeenCalledTimes(2);
});
it.each(['mute','offline','get','resize','unmount','no-visual'] as const)('drops pending declaration sound after %s',reason=>{
 const {before,after}=declarationPair('sanma','tsumo'),v=render(<Harness room={before}/>);v.rerender(<Harness room={after} visual={reason!=='no-visual'}/>);
 advance(100);
 if(reason==='mute')fireEvent.click(v.getByRole('button',{name:'切换声音'}));
 if(reason==='offline')v.rerender(<Harness room={after} connected={false}/>);
 if(reason==='get')v.rerender(<Harness room={after} canAnimate={false}/>);
 if(reason==='resize')act(()=>window.dispatchEvent(new Event('resize')));
 if(reason==='unmount')v.unmount();
 advance(1500);expect(audio.play).not.toHaveBeenCalled();
});
