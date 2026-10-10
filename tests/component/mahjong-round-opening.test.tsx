// @vitest-environment jsdom
import {StrictMode} from 'react';
import {act,cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TableAudioPlayer} from '@/components/mahjong/table-audio';
import {GameRoom} from '@/components/mahjong/mahjong-client';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import type {RoomView} from '@/modules/mahjong/types';
let room:RoomView;let media:EventTarget & {matches:boolean};
beforeEach(()=>{vi.useFakeTimers();media=Object.assign(new EventTarget(),{matches:false});vi.stubGlobal("matchMedia",()=>media);room={id:'opening',code:'ABCDEFGH',hostUserId:'0',variant:'yonma',mode:'east',status:'playing',version:1,mySeat:0,members:[],game:physicalEngine('yonma',{0:'p123456789s123z2'},'z2').view(0)};});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const key=(r:RoomView)=>JSON.stringify([r.id,r.game?.gameInstanceId,r.game?.handId,r.mySeat]);
function show(r=room,intent:string|null=key(r)){
 const onChoice=vi.fn(),props={room:r,ownSeat:0,connected:true,motionCanAnimate:true,openingIntent:intent,busy:false,host:false,onChoice,onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}};
 return {onChoice,props,...render(<GameRoom {...props}/>)};
}
const hand=()=>[...document.querySelectorAll('.mahjong-hand button[data-hand-instance-id]')];
const shown=()=>hand().filter(n=>n.getAttribute('data-deal-visible')!=='false').length;
for(const variant of ['sanma','yonma'] as const)it('deals four waves, reveals dora at 1200 and offers operations at 1500 in '+variant,()=>{
 room={...room,variant,game:physicalEngine(variant,{0:'p123456789s123z2'},'z2').view(0)};const t=show();
 expect(shown()).toBe(4);expect(document.querySelectorAll('.mahjong-table__dora .mahjong-tile')).toHaveLength(0);expect(screen.queryByRole('button',{name:'自摸'})).toBeNull();
 for(const [dt,count]of [[299,4],[1,8],[300,12],[300,14],[299,14]] as const){act(()=>vi.advanceTimersByTime(dt));expect(shown()).toBe(count);}
 expect(document.querySelectorAll('.mahjong-table__dora .mahjong-tile')).toHaveLength(0);act(()=>vi.advanceTimersByTime(1));expect(document.querySelectorAll('.mahjong-table__dora .mahjong-tile')).toHaveLength(1);
 expect(hand().every(n=>n.hasAttribute('disabled'))).toBe(true);act(()=>vi.advanceTimersByTime(299));expect(screen.queryByRole('button',{name:'自摸'})).toBeNull();act(()=>vi.advanceTimersByTime(1));fireEvent.click(screen.getByRole('button',{name:'自摸'}));expect(t.onChoice).toHaveBeenCalledOnce();
});
it('a baseline has no deal replay or operation delay',()=>{show(room,null);expect(shown()).toBe(14);expect(screen.getByRole('button',{name:'自摸'}).hasAttribute('disabled')).toBe(false);});
it('a duplicate snapshot does not restart a running opening',()=>{const t=show();act(()=>vi.advanceTimersByTime(600));t.rerender(<GameRoom {...t.props} room={{...room}}/>);expect(shown()).toBe(12);act(()=>vi.advanceTimersByTime(900));expect(screen.getByRole('button',{name:'自摸'}).hasAttribute('disabled')).toBe(false);});
for(const reason of ['disconnect','visibility','resize','decision','scope','reduced'] as const)it('retires the opening without replay after '+reason,()=>{
 const t=show();act(()=>vi.advanceTimersByTime(300));
 if(reason==='disconnect')t.rerender(<GameRoom {...t.props} connected={false}/>);
 else if(reason==='decision')t.rerender(<GameRoom {...t.props} room={{...room,game:{...room.game!,decisionId:'later'}}}/>);
 else if(reason==='scope')t.rerender(<GameRoom {...t.props} room={{...room,id:'another'}}/>);
 else if(reason==='reduced'){act(()=>{media.matches=true;media.dispatchEvent(new Event('change'));});media.matches=false;}
 else act(()=>reason==='visibility'?document.dispatchEvent(new Event('visibilitychange')):window.dispatchEvent(new Event('resize')));
 t.rerender(<GameRoom {...t.props}/>);act(()=>vi.advanceTimersByTime(2000));expect(shown()).toBe(14);expect(t.onChoice).not.toHaveBeenCalled();
});

it('emits four original deal cues once, never replaying on duplicate snapshots',()=>{const play=vi.spyOn(TableAudioPlayer.prototype,'play');const t=show();for(let i=0;i<3;i++)act(()=>vi.advanceTimersByTime(300));t.rerender(<GameRoom {...t.props} room={{...room}}/>);act(()=>vi.advanceTimersByTime(900));expect(play.mock.calls.filter(([e])=>e.kind==='draw')).toHaveLength(4);expect(new Set(play.mock.calls.map(([e])=>e.id)).size).toBe(4);});
it('muting suppresses a wave and unmuting never replays the missed cue',()=>{const play=vi.spyOn(TableAudioPlayer.prototype,'play');show();act(()=>vi.advanceTimersByTime(200));fireEvent.click(screen.getByRole('button',{name:'关闭音效'}));act(()=>vi.advanceTimersByTime(300));fireEvent.click(screen.getByRole('button',{name:'开启音效'}));act(()=>vi.advanceTimersByTime(100));act(()=>vi.advanceTimersByTime(300));expect(play.mock.calls.filter(([e])=>e.kind==='draw').map(([e])=>JSON.parse(e.id)[1])).toEqual([0,2,3]);});

it('preserves the original deadline through React Strict Mode effect cleanup and setup',()=>{const onChoice=vi.fn();render(<StrictMode><GameRoom room={room} ownSeat={0} connected motionCanAnimate openingIntent={key(room)} busy={false} host={false} onChoice={onChoice} onFinish={()=>{}} onLeave={()=>{}} onRematch={()=>{}}/></StrictMode>);expect(shown()).toBe(4);act(()=>vi.advanceTimersByTime(300));expect(shown()).toBe(8);act(()=>vi.advanceTimersByTime(900));expect(document.querySelectorAll('.mahjong-table__dora .mahjong-tile')).toHaveLength(1);act(()=>vi.advanceTimersByTime(300));fireEvent.click(screen.getByRole('button',{name:'自摸'}));expect(onChoice).toHaveBeenCalledOnce();});

for(const variant of ['sanma','yonma'] as const)it('shows real opening order then normalized choice-bound tiles at 1200 '+variant,()=>{
 room={...room,variant,game:physicalEngine(variant,{0:'p987654321s321z2'},'z2').view(0)};
 const t=show();const values=()=>hand().map(n=>n.getAttribute('data-hand-instance-id')!.split(':').at(-1));
 expect(values().slice(0,13)).toEqual(room.game!.initialDeal);
 const physicalNodes=hand().slice(0,13);
 act(()=>vi.advanceTimersByTime(1199));expect(values().slice(0,13)).toEqual(room.game!.initialDeal);
 act(()=>vi.advanceTimersByTime(1));expect(values()).toEqual(room.game!.hand);
 expect(hand().slice(0,13).every(node=>physicalNodes.includes(node))).toBe(true);
 act(()=>vi.advanceTimersByTime(300));const draw=hand().at(-1)!;
 expect(draw.getAttribute('data-choice-id')).toBe(room.game!.choices.find(c=>c.type==='discard'&&c.value?.endsWith('_'))!.id);
 expect(t.onChoice).not.toHaveBeenCalled();
});

for(const variant of ['sanma','yonma'] as const)it('sorts all fourteen without confusing visual separation with the real draw '+variant,()=>{
 room={...room,variant,game:physicalEngine(variant,{0:'p23987654s321z22'},'p1').view(0)};
 const t=show(),physicalNodes=hand();
 act(()=>vi.advanceTimersByTime(1200));
 expect(hand().map(n=>n.getAttribute('data-tile-face'))).toEqual(['p1','p2','p3','p4','p5','p6','p7','p8','p9','s1','s2','s3','z2','z2']);
 expect(hand().every(node=>physicalNodes.includes(node))).toBe(true);
 expect(hand()[0].getAttribute('data-hand-instance-id')).toContain('drawn:');
 expect(hand()[0].classList.contains('is-drawn')).toBe(false);
 expect(hand().at(-1)!.classList.contains('is-drawn')).toBe(true);
 act(()=>vi.advanceTimersByTime(300));
 expect(hand()[0].getAttribute('data-tile-face')).toBe('p1');
 fireEvent.click(hand()[0]);fireEvent.click(hand()[0]);
 expect(t.onChoice.mock.calls[0][0].value).toBe('p1_');
});

it('keeps a real north draw in the middle usable for nuki sanma',()=>{
 const variant='sanma' as const;
 const engine=physicalEngine(variant,{0:'p123456789s12z57'},'z4');
 room={...room,variant,game:engine.view(0)};const t=show();act(()=>vi.advanceTimersByTime(1500));
 const north=hand().find(n=>n.getAttribute('data-hand-instance-id')?.startsWith('drawn:'))!;
 expect(north.getAttribute('data-tile-face')).toBe('z4');expect(north.classList.contains('is-drawn')).toBe(false);
 expect(hand().at(-1)!.getAttribute('data-tile-face')).toBe('z7');
 fireEvent.click(screen.getByRole('button',{name:/^拔北$/}));
 const chosen=t.onChoice.mock.calls[0][0];expect(chosen.type).toBe('nuki');
 const before=engine.view(0);engine.respond(0,before.decisionId,chosen.id);
 for(let i=0;i<4;i++)for(let seat=1;seat<3;seat++){const v=engine.view(seat),pass=v.choices.find(c=>c.type==='pass');if(pass)engine.respond(seat,v.decisionId,pass.id);}
 const next=engine.view(0);expect(next.players[0].nuki).toBe(1);expect(next.initialDeal).toBeUndefined();
 t.rerender(<GameRoom {...t.props} room={{...room,version:2,game:next}}/>);
 expect(document.querySelector('[aria-label="公开拔北数量：1"]')).toBeTruthy();
});

for(const variant of ['sanma','yonma'] as const)it('double felt tap discards the displayed opening last tile '+variant,()=>{
 const pref='yougui.mahjong.doubleClick',previous=localStorage.getItem(pref);localStorage.setItem(pref,'1');
 try{
  room={...room,variant,game:physicalEngine(variant,{0:'p23987654s321z22'},'p1').view(0)};
  const t=show();act(()=>vi.advanceTimersByTime(1500));
  expect(hand().at(-1)!.getAttribute('data-tile-face')).toBe('z2');
  vi.spyOn(hand().at(-1)!,'getBoundingClientRect').mockReturnValue(new DOMRect(100,200,40,60));
  const felt=document.querySelector('.mahjong-table__surface')!;
  const tap=()=>{for(const type of ['pointerdown','pointerup']){const event=new Event(type,{bubbles:true});Object.assign(event,{pointerId:1,button:0,isPrimary:true,clientX:100,clientY:100});fireEvent(felt,event);}};
  tap();act(()=>vi.advanceTimersByTime(60));tap();
  expect(t.onChoice).toHaveBeenCalledOnce();expect(t.onChoice.mock.calls[0][0].value).toBe('z2');
  expect(t.onChoice.mock.calls[0][1].sourceTileId).toBe(hand().at(-1)!.getAttribute('data-hand-instance-id'));
 }finally{if(previous===null)localStorage.removeItem(pref);else localStorage.setItem(pref,previous);}
});
