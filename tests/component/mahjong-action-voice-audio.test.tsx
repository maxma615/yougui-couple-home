// @vitest-environment jsdom
import React,{useRef} from 'react';
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useTableAudio} from '@/components/mahjong/use-table-audio';
import {actionVoiceSequence} from '../fixtures/mahjong-action-voice-game';
import type {RoomView} from '@/modules/mahjong/types';
const audio=vi.hoisted(()=>({play:vi.fn(),unlock:vi.fn(async()=>true),setEnabled:vi.fn(),pause:vi.fn(),cancel:vi.fn(),dispose:vi.fn()}));
vi.mock('@/components/mahjong/table-audio',()=>({TableAudioPlayer:class{play=audio.play;unlock=audio.unlock;setEnabled=audio.setEnabled;pause=audio.pause;cancel=audio.cancel;dispose=audio.dispose;}}));
function Harness({room,connected=true,canAnimate=true,marker='correct'}:{room:RoomView;connected?:boolean;canAnimate?:boolean;marker?:string}){
 const ref=useRef<HTMLElement>(null),sound=useTableAudio({room,connected,canAnimate,rootRef:ref});
 return <main ref={ref}><button onClick={sound.toggle}>切换声音</button>{marker!=='none'?<div data-action-voice-kind={marker==='kind'?'chi':'pon'} data-feedback-decision={marker==='decision'?'stale':room.game!.decisionId} data-feedback-seat={marker==='seat'?2:1}/>:null}</main>;
}
beforeEach(()=>{vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance','requestAnimationFrame','cancelAnimationFrame']});vi.clearAllMocks();localStorage.clear();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(()=>{cleanup();vi.useRealTimers();});
const advance=(ms:number)=>act(()=>vi.advanceTimersByTime(ms));
const voices=()=>audio.play.mock.calls.filter(c=>['chi','pon','kan','north'].includes(c[0].kind));
function pair(){const {frames}=actionVoiceSequence('yonma','pon');return {before:frames[1],after:frames[2]};}
it('starts one voice only with the matching visible seat, action and accepted decision',()=>{
 const {before,after}=pair(),v=render(<Harness room={before}/>);v.rerender(<Harness room={after}/>);advance(16);expect(voices()).toHaveLength(1);expect(voices()[0][0]).toMatchObject({kind:'pon',seat:1});
 v.rerender(<Harness room={structuredClone(after)}/>);advance(1000);expect(voices()).toHaveLength(1);
});
for(const marker of ['none','kind','seat','decision'])it(`does not speak for ${marker} announcement markers`,()=>{
 const {before,after}=pair(),v=render(<Harness room={before}/>);v.rerender(<Harness room={after} marker={marker}/>);advance(950);expect(voices()).toHaveLength(0);
 v.rerender(<Harness room={after}/>);advance(100);expect(voices()).toHaveLength(0);
});
for(const reason of ['mute','offline','get','resize','hidden','unmount'])it(`cancels a voice awaiting its marker after ${reason}`,()=>{
 const {before,after}=pair(),v=render(<Harness room={before}/>);v.rerender(<Harness room={after} marker="none"/>);advance(16);
 if(reason==='mute')fireEvent.click(v.getByRole('button',{name:'切换声音'}));if(reason==='offline')v.rerender(<Harness room={after} connected={false}/>);if(reason==='get')v.rerender(<Harness room={after} canAnimate={false}/>);if(reason==='resize')act(()=>window.dispatchEvent(new Event('resize')));
 if(reason==='hidden'){Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});act(()=>document.dispatchEvent(new Event('visibilitychange')));}if(reason==='unmount')v.unmount();
 advance(1000);expect(voices()).toHaveLength(0);
});
