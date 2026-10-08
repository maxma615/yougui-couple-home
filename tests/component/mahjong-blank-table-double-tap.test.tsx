// @vitest-environment jsdom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import type {PointerEvent} from 'react';
import {useBlankTableDoubleTap,blankTablePreference} from '@/components/mahjong/use-blank-table-double-tap';
let now:number,surface:HTMLElement;
beforeEach(()=>{now=100;localStorage.clear();surface=document.createElement('div');surface.className='mahjong-table__surface';document.body.append(surface);vi.spyOn(performance,'now').mockImplementation(()=>now);});
afterEach(()=>{cleanup();surface.remove();localStorage.clear();vi.restoreAllMocks();});
const event=(target:EventTarget=surface,extra={})=>({target,pointerId:1,button:0,isPrimary:true,clientX:100,clientY:100,...extra}) as PointerEvent<HTMLElement>;
const setup=()=>{const onDoubleTap=vi.fn(()=>true),initial={scope:'decision-1',disabled:false,onDoubleTap};return {...renderHook(p=>useBlankTableDoubleTap(p),{initialProps:initial}),onDoubleTap,initial};};
const tap=(t:ReturnType<typeof setup>)=>{act(()=>t.result.current.down(event()));act(()=>t.result.current.up(event()));};
it('is off by default, persists explicit preference and never replays one decision',()=>{
 const t=setup();tap(t);now+=100;tap(t);expect(t.onDoubleTap).not.toHaveBeenCalled();
 act(()=>t.result.current.toggle());expect(localStorage.getItem(blankTablePreference)).toBe('1');tap(t);now+=299;tap(t);expect(t.onDoubleTap).toHaveBeenCalledOnce();
 tap(t);now+=100;tap(t);expect(t.onDoubleTap).toHaveBeenCalledOnce();
 t.rerender({...t.initial,scope:'decision-2'});tap(t);now+=100;tap(t);expect(t.onDoubleTap).toHaveBeenCalledTimes(2);
});
it('does not count 300ms, drags, right clicks, nonprimary pointers or controls as a double tap',()=>{
 const t=setup();act(()=>t.result.current.toggle());tap(t);now+=300;tap(t);expect(t.onDoubleTap).not.toHaveBeenCalled();
 const button=document.createElement('button');surface.append(button);
 for(const altered of [event(surface,{button:2}),event(surface,{isPrimary:false}),event(button)]){
  t.result.current.reset();tap(t);now+=100;act(()=>t.result.current.down(altered));act(()=>t.result.current.up(altered));expect(t.onDoubleTap).not.toHaveBeenCalled();
 }
 t.result.current.reset();tap(t);now+=100;act(()=>t.result.current.down(event()));act(()=>t.result.current.up(event(surface,{clientX:109})));expect(t.onDoubleTap).not.toHaveBeenCalled();
});
for(const interruption of ['blur','pagehide','visibilitychange','cancel','disabled','scope','key'] as const)it('clears the first tap on '+interruption,()=>{
 const t=setup();act(()=>t.result.current.toggle());tap(t);now+=100;
 if(interruption==='disabled'){t.rerender({...t.initial,disabled:true});t.rerender(t.initial);}
 else if(interruption==='scope')t.rerender({...t.initial,scope:'decision-2'});
 else if(interruption==='cancel'||interruption==='key')t.result.current.reset();
 else act(()=> (interruption==='visibilitychange'?document:window).dispatchEvent(new Event(interruption)));
 tap(t);expect(t.onDoubleTap).not.toHaveBeenCalled();now+=100;tap(t);expect(t.onDoubleTap).toHaveBeenCalledOnce();
});
it('can return from a local picker then perform an operation on a second explicit pair',()=>{
 const t=setup();t.onDoubleTap.mockReturnValueOnce(false);act(()=>t.result.current.toggle());tap(t);now+=100;tap(t);expect(t.onDoubleTap).toHaveBeenCalledOnce();
 now+=100;tap(t);now+=100;tap(t);expect(t.onDoubleTap).toHaveBeenCalledTimes(2);
});
it('reads the explicit preference, tolerates storage failure and ignores a hidden page',()=>{
 localStorage.setItem(blankTablePreference,'1');const t=setup();expect(t.result.current.enabled).toBe(true);
 const visibility=vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');tap(t);now+=100;tap(t);expect(t.onDoubleTap).not.toHaveBeenCalled();visibility.mockReturnValue('visible');
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('disabled');});act(()=>t.result.current.toggle());expect(t.result.current.enabled).toBe(false);
});

it('requires explicit authoritative recovery before allowing another pair for the same decision',()=>{
 const onDoubleTap=vi.fn(()=>true),initial={scope:'decision-1',disabled:false,onDoubleTap,recoveryEpoch:0};
 const t=renderHook(p=>useBlankTableDoubleTap(p),{initialProps:initial});
 act(()=>t.result.current.toggle());
 const pair=()=>{for(let i=0;i<2;i++){act(()=>t.result.current.down(event()));act(()=>t.result.current.up(event()));now+=100;}};
 pair();expect(onDoubleTap).toHaveBeenCalledOnce();
 t.rerender({...initial,disabled:true});t.rerender(initial);pair();expect(onDoubleTap).toHaveBeenCalledOnce();
 // A successful server baseline explicitly rearms, but never replays an old pair.
 t.rerender({...initial,recoveryEpoch:1});expect(onDoubleTap).toHaveBeenCalledOnce();
 pair();expect(onDoubleTap).toHaveBeenCalledTimes(2);pair();expect(onDoubleTap).toHaveBeenCalledTimes(2);
});
