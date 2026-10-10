import {kakanSoundFixture} from '../fixtures/mahjong-audio-game';
// @vitest-environment jsdom
import React,{useRef} from 'react';
import {createPortal} from 'react-dom';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GameRoom} from '@/components/mahjong/mahjong-client';
import {useTableAudio} from '@/components/mahjong/use-table-audio';
import {acceptedTableSounds} from '@/components/mahjong/table-sounds';
import {northReplacementFixture} from '../fixtures/mahjong-view-game';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {RoomView} from '@/modules/mahjong/types';
const audio=vi.hoisted(()=>({play:vi.fn(),unlock:vi.fn(async()=>true),setEnabled:vi.fn(),pause:vi.fn(),cancel:vi.fn(),dispose:vi.fn()}));
vi.mock('@/components/mahjong/table-audio',()=>({TableAudioPlayer:class{play=audio.play;unlock=audio.unlock;setEnabled=audio.setEnabled;pause=audio.pause;cancel=audio.cancel;dispose=audio.dispose;}}));
function pair(){const game=physicalEngine('yonma',{0:'p1s123456789z123',1:'p11s123456789z45'},'p9');const room=(version:number):RoomView=>({id:'r',code:'ABCDEFGH',hostUserId:'0',variant:'yonma',mode:'east',status:'playing',version,mySeat:0,game:game.view(0),members:[]});const before=room(1),v=game.view(0),c=v.choices.find(c=>c.type==='discard'&&c.value==='p1')!;game.respond(0,v.decisionId,c.id);return {before,after:room(2)};}
function Harness({room,connected=true,canAnimate=true,flight,portal=false,held=false}: {room:RoomView;connected?:boolean;canAnimate?:boolean;flight?:string;portal?:boolean;held?:boolean}){
 const ref=useRef<HTMLElement>(null),sound=useTableAudio({room,connected,canAnimate,rootRef:ref});
 return <main ref={ref}>{held?<span className="mahjong-drawn-wrap is-nuki-held"/>:null}<button onClick={sound.toggle}>{sound.enabled?'关闭音效':'开启音效'}</button>{flight?(portal?createPortal(<div data-motion-event={flight}/>,document.body):<div data-motion-event={flight}/>):null}<button onClick={()=>sound.land(flight??'')}>落地</button></main>;
}
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();window.localStorage.clear();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});});
afterEach(()=>{cleanup();vi.useRealTimers();});
const frame=()=>act(()=>vi.advanceTimersByTime(32));
it('mounts silently, then sounds a live state without an animated flight once',()=>{const {before,after}=pair(),r=render(<Harness room={before}/>);frame();expect(audio.play).not.toHaveBeenCalled();r.rerender(<Harness room={after}/>);frame();expect(audio.play).toHaveBeenCalledOnce();expect(audio.play.mock.calls[0][0]).toMatchObject({kind:'discard',seat:0});r.rerender(<Harness room={structuredClone(after)}/>);frame();expect(audio.play).toHaveBeenCalledOnce();});
it('waits for the actual flight completion rather than a guessed timeout',()=>{const {before,after}=pair(),id=acceptedTableSounds(before,after)[0].id,r=render(<Harness room={before}/>);r.rerender(<Harness room={after} flight={id}/>);frame();act(()=>vi.advanceTimersByTime(1000));expect(audio.play).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'落地'}));expect(audio.play).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'落地'}));expect(audio.play).toHaveBeenCalledOnce();});
it('mutes immediately, remembers the choice and discards pending sounds',()=>{const {before,after}=pair(),id=acceptedTableSounds(before,after)[0].id,r=render(<Harness room={before}/>);r.rerender(<Harness room={after} flight={id}/>);frame();fireEvent.click(screen.getByRole('button',{name:'关闭音效'}));expect(window.localStorage.getItem('yougui.mahjong.sound')).toBe('off');fireEvent.click(screen.getByRole('button',{name:'落地'}));expect(audio.play).not.toHaveBeenCalled();expect(audio.setEnabled).toHaveBeenLastCalledWith(false);fireEvent.click(screen.getByRole('button',{name:'开启音效'}));frame();expect(audio.play).not.toHaveBeenCalled();});
it('reads remembered mute and survives blocked localStorage',()=>{window.localStorage.setItem('yougui.mahjong.sound','off');const {before}=pair();const r=render(<Harness room={before}/>);expect(screen.getByRole('button',{name:'开启音效'})).toBeTruthy();const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('blocked');});fireEvent.click(screen.getByRole('button',{name:'开启音效'}));expect(screen.getByRole('button',{name:'关闭音效'})).toBeTruthy();spy.mockRestore();r.unmount();expect(audio.dispose).toHaveBeenCalledOnce();});
it('disconnect and reconnect cancel old flights without replaying their cues',()=>{const {before,after}=pair(),id=acceptedTableSounds(before,after)[0].id,r=render(<Harness room={before}/>);r.rerender(<Harness room={after} flight={id}/>);frame();r.rerender(<Harness room={after} connected={false} flight={id}/>);expect(audio.pause).toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'落地'}));r.rerender(<Harness room={after} flight={id}/>);frame();expect(audio.play).not.toHaveBeenCalled();});
it('background invalidates the baseline and pending completion',()=>{const {before,after}=pair(),id=acceptedTableSounds(before,after)[0].id,r=render(<Harness room={before}/>);r.rerender(<Harness room={after} flight={id}/>);frame();act(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});fireEvent.click(screen.getByRole('button',{name:'落地'}));expect(audio.play).not.toHaveBeenCalled();expect(audio.pause).toHaveBeenCalled();});
it('a GET refresh cannot invent a sound',()=>{const {before,after}=pair(),r=render(<Harness room={before}/>);r.rerender(<Harness room={after} canAnimate={false}/>);frame();expect(audio.play).not.toHaveBeenCalled();r.rerender(<Harness room={after}/>);frame();expect(audio.play).not.toHaveBeenCalled();});
it('unmount clears a queued frame and disposes audio',()=>{const {before,after}=pair(),r=render(<Harness room={before}/>);r.rerender(<Harness room={after}/>);r.unmount();frame();expect(audio.play).not.toHaveBeenCalled();expect(audio.dispose).toHaveBeenCalledOnce();});

it('puts the remembered mute control on the real GameRoom',()=>{const {before}=pair();render(<GameRoom room={before} ownSeat={0} host={false} connected busy={false} motionCanAnimate={false} onChoice={()=>{}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/>);const button=screen.getByRole('button',{name:'关闭音效'});fireEvent.click(button);expect(screen.getByRole('button',{name:'开启音效'})).toBeTruthy();expect(window.localStorage.getItem('yougui.mahjong.sound')).toBe('off');});

it('waits for a real flight portal outside the GameRoom DOM subtree',()=>{const {before,after}=pair(),id=acceptedTableSounds(before,after)[0].id,r=render(<Harness room={before}/>);r.rerender(<Harness room={after} flight={id} portal/>);frame();expect(audio.play).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'落地'}));expect(audio.play).toHaveBeenCalledOnce();});

it('does not sound a replacement draw while its real tile is still held behind the extraction',()=>{const game=northReplacementFixture();const room=(version:number):RoomView=>({id:'north',code:'ABCDEFGH',hostUserId:'0',variant:'sanma',mode:'east',status:'playing',version,mySeat:0,game:game.view(0),members:[]});const before=room(1),v=game.view(0),c=v.choices.find(c=>c.type==='nuki')!;game.respond(0,v.decisionId,c.id);for(let seat=1;seat<3;seat++){const w=game.view(seat),pass=w.choices.find(c=>c.type==='pass');if(pass)game.respond(seat,w.decisionId,pass.id);}const after=room(2),id=acceptedTableSounds(before,after)[0].id,r=render(<Harness room={before}/>);r.rerender(<Harness room={after} flight={id} held/>);frame();fireEvent.click(screen.getByRole('button',{name:'落地'}));frame();expect(audio.play).toHaveBeenCalledOnce();expect(audio.play.mock.calls[0][0].kind).toBe('nuki');r.rerender(<Harness room={after}/>);frame();expect(audio.play).toHaveBeenCalledTimes(2);expect(audio.play.mock.calls[1][0].kind).toBe('draw');});

it.each(['pass','ron','disconnect','refresh','mute'] as const)('handles pending native kakan %s without catch-up replay',mode=>{
 const game=kakanSoundFixture(),view=(version:number):RoomView=>({id:'kakan',code:'ABCDEFGH',hostUserId:'0',variant:'yonma',mode:'east',status:'playing',version,mySeat:1,game:game.view(1),members:[]}),before=view(1),r=render(<Harness room={before}/>),v=game.view(1),kan=v.choices.find(c=>c.type==='kan'&&!!c.value?.match(/^[mpsz]\d{3}[+\-=]\d$/))!;game.respond(1,v.decisionId,kan.id);const pending=view(2);r.rerender(<Harness room={pending}/>);frame();expect(audio.play).not.toHaveBeenCalled();
 if(mode==='disconnect'){r.rerender(<Harness room={pending} connected={false}/>);r.rerender(<Harness room={pending}/>);}if(mode==='refresh')r.rerender(<Harness room={pending} canAnimate={false}/>);if(mode==='mute'){fireEvent.click(screen.getByRole('button',{name:'关闭音效'}));fireEvent.click(screen.getByRole('button',{name:'开启音效'}));}
 const w=game.view(2),choice=w.choices.find(c=>c.type===(mode==='ron'?'ron':'pass'))!;game.respond(2,w.decisionId,choice.id);r.rerender(<Harness room={view(3)}/>);frame();frame();if(mode==='pass'){expect(audio.play.mock.calls.map(c=>c[0].kind)).toEqual(['call','draw']);}else expect(audio.play).not.toHaveBeenCalled();
});

function SharedLobbyAudio({room,playing}:{room:RoomView;playing:boolean}){
 const ref=useRef<HTMLDivElement>(null),audio=useTableAudio({room,connected:true,canAnimate:true,rootRef:ref});
 return <div ref={ref}>{playing?<GameRoom tableAudio={audio} room={room} ownSeat={0} host={false} connected busy={false} motionCanAnimate={false} onChoice={()=>{}} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/>:<button onClick={audio.toggle}>{audio.enabled?'大厅静音':'大厅开声'}</button>}</div>;
}
it('keeps one audio owner across the lobby-to-table transition and disposes it once',()=>{
 const {before}=pair(),r=render(<SharedLobbyAudio room={before} playing={false}/>);
 r.rerender(<SharedLobbyAudio room={before} playing/>);expect(audio.dispose).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'关闭音效'}));expect(audio.setEnabled).toHaveBeenLastCalledWith(false);
 r.rerender(<SharedLobbyAudio room={before} playing={false}/>);expect(screen.getByRole('button',{name:'大厅开声'})).toBeTruthy();expect(audio.dispose).not.toHaveBeenCalled();
 r.unmount();expect(audio.dispose).toHaveBeenCalledOnce();
});
it('keeps the remembered mute when the lobby hands its audio owner to GameRoom',()=>{
 window.localStorage.setItem('yougui.mahjong.sound','off');const {before}=pair(),r=render(<SharedLobbyAudio room={before} playing={false}/>);
 expect(screen.getByRole('button',{name:'大厅开声'})).toBeTruthy();r.rerender(<SharedLobbyAudio room={before} playing/>);
 expect(screen.getByRole('button',{name:'开启音效'})).toBeTruthy();expect(audio.unlock).not.toHaveBeenCalled();r.unmount();expect(audio.dispose).toHaveBeenCalledOnce();
});

function OpeningAudioHarness(){
 const ref=useRef<HTMLElement>(null),sound=useTableAudio({room:null,connected:true,canAnimate:true,rootRef:ref});
 return <main ref={ref}><button onClick={()=>sound.dealWave('opening',0)}>发牌</button><button onClick={sound.invalidate}>取消</button><button onClick={sound.toggle}>静音</button></main>;
}
it.each(['ready','expired','cancel','mute','unmount'] as const)('bounds the pending real gesture resume for an opening cue: %s',async mode=>{
 const listener=vi.spyOn(document,'addEventListener');let resolve!:(value:boolean)=>void;
 audio.unlock.mockImplementationOnce(()=>new Promise<boolean>(r=>{resolve=r;}));const view=render(<OpeningAudioHarness/>);
 const callback=listener.mock.calls.filter(([name])=>name==='pointerdown').at(-1)![1] as EventListener;
 callback({isTrusted:true,target:screen.getByRole('button',{name:'发牌'})} as unknown as Event);
 fireEvent.click(screen.getByRole('button',{name:'发牌'}));expect(audio.play).not.toHaveBeenCalled();
 if(mode==='expired')act(()=>vi.advanceTimersByTime(100));
 if(mode==='cancel')fireEvent.click(screen.getByRole('button',{name:'取消'}));
 if(mode==='mute')fireEvent.click(screen.getByRole('button',{name:'静音'}));
 if(mode==='unmount')view.unmount();
 await act(async()=>resolve(true));expect(audio.play).toHaveBeenCalledTimes(mode==='ready'?1:0);listener.mockRestore();
});
