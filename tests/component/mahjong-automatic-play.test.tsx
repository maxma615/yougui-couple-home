// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {useAutomaticPlay} from '@/components/mahjong/use-automatic-play';
import {physicalEngine} from '../fixtures/mahjong-settlement-game';
import reference from '../fixtures/mahjong-automatic-round-reference.json';
import type {RoomView} from '@/modules/mahjong/types';
let room:RoomView;
beforeEach(()=>{vi.useFakeTimers();room={id:'table',code:'ABCDEFGH',hostUserId:'0',variant:'yonma',mode:'east',status:'playing',version:1,mySeat:0,members:[],game:physicalEngine('yonma',{0:'p123456789s123z2'},'z2').view(0)};});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
const setup=()=>{const onChoice=vi.fn(),initial={room,ownSeat:0,connected:true,busy:false,onChoice};return {...renderHook(p=>useAutomaticPlay(p),{initialProps:initial}),onChoice,initial};};
it('defaults off then wins at 800ms once, not on repeated snapshots',()=>{
 const t=setup();act(()=>vi.advanceTimersByTime(1000));expect(t.onChoice).not.toHaveBeenCalled();act(()=>t.result.current.toggle('win'));act(()=>vi.advanceTimersByTime(799));expect(t.onChoice).not.toHaveBeenCalled();act(()=>vi.advanceTimersByTime(1));expect(t.onChoice).toHaveBeenCalledOnce();expect(t.onChoice.mock.calls[0][0].type).toBe('tsumo');t.rerender({...t.initial,room:{...room,version:2}});act(()=>vi.advanceTimersByTime(1000));expect(t.onChoice).toHaveBeenCalledOnce();
});
for(const interruption of ['disconnect','busy','manual','toggle','hidden','pagehide','unmount','decision','scope'] as const)it('cancels pending win on '+interruption,()=>{
 const t=setup();act(()=>t.result.current.toggle('win'));act(()=>vi.advanceTimersByTime(400));
 if(interruption==='disconnect')t.rerender({...t.initial,connected:false});
 if(interruption==='busy')t.rerender({...t.initial,busy:true});
 if(interruption==='manual')act(()=>t.result.current.manual());
 if(interruption==='toggle')act(()=>t.result.current.toggle('win'));
 if(interruption==='hidden')act(()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));});
 if(interruption==='pagehide')act(()=>window.dispatchEvent(new Event('pagehide')));
 if(interruption==='unmount')t.unmount();
 if(interruption==='decision')t.rerender({...t.initial,room:{...room,game:{...room.game!,decisionId:'other',choices:[]}}});
 if(interruption==='scope')t.rerender({...t.initial,room:{...room,id:'another'}});
 act(()=>vi.advanceTimersByTime(1000));expect(t.onChoice).not.toHaveBeenCalled();
});
it('requires connected baseline then resumes a fresh decision after reconnect',()=>{
 const t=setup();act(()=>t.result.current.toggle('win'));t.rerender({...t.initial,connected:false});act(()=>vi.advanceTimersByTime(1000));expect(t.onChoice).not.toHaveBeenCalled();t.rerender(t.initial);act(()=>vi.advanceTimersByTime(800));expect(t.onChoice).toHaveBeenCalledOnce();
});
it('resets preferences at a new hand and a different seat',()=>{
 const t=setup();act(()=>t.result.current.toggle('noCalls'));t.rerender({...t.initial,room:{...room,game:{...room.game!,handId:2}}});expect(t.result.current.options.noCalls).toBe(false);t.rerender({...t.initial,ownSeat:1});expect(t.result.current.options.noCalls).toBe(false);t.rerender(t.initial);expect(t.result.current.options.noCalls).toBe(false);
});

it('restarts a fresh win delay after returning to the foreground, without replaying an already sent decision',()=>{
 const t=setup();const visibility=vi.spyOn(document,'visibilityState','get');act(()=>t.result.current.toggle('win'));act(()=>vi.advanceTimersByTime(400));act(()=>{visibility.mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));});act(()=>vi.advanceTimersByTime(1000));expect(t.onChoice).not.toHaveBeenCalled();act(()=>{visibility.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));});act(()=>vi.advanceTimersByTime(799));expect(t.onChoice).not.toHaveBeenCalled();act(()=>vi.advanceTimersByTime(1));expect(t.onChoice).toHaveBeenCalledOnce();act(()=>document.dispatchEvent(new Event('visibilitychange')));act(()=>vi.advanceTimersByTime(1000));expect(t.onChoice).toHaveBeenCalledOnce();
});

for(const variant of ['sanma','yonma'] as const)it('clears all four toggles and a pending win before the next '+variant+' hand',()=>{
 const game=physicalEngine(variant,{0:'p123456789s123z2'},'z2');room={...room,variant,game:game.view(0)};const t=setup();
 act(()=>{for(const key of ['win','noCalls','drawnDiscard','north'] as const)t.result.current.toggle(key);});act(()=>vi.advanceTimersByTime(400));
 const next={...room,version:2,game:{...room.game!,handId:room.game!.handId!+1,decisionId:'new-round'}};t.rerender({...t.initial,room:next});
 expect(t.result.current.options).toEqual(reference.options);act(()=>vi.advanceTimersByTime(2000));expect(t.onChoice).not.toHaveBeenCalled();
});
it('retains options for a new decision, identical snapshot, and reconnect within the same hand',()=>{
 const t=setup();act(()=>t.result.current.toggle('noCalls'));
 const next={...room,version:2,game:{...room.game!,decisionId:'next-choice'}};t.rerender({...t.initial,room:next});expect(t.result.current.options.noCalls).toBe(true);
 t.rerender({...t.initial,room:{...next,version:3}});expect(t.result.current.options.noCalls).toBe(true);
 t.rerender({...t.initial,room:next,connected:false});t.rerender({...t.initial,room:next});expect(t.result.current.options.noCalls).toBe(true);
});
