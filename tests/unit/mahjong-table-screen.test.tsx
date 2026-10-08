// @vitest-environment jsdom
// Browser API boundaries are simulated here; this is not Android hardware acceptance.
import {act,cleanup,renderHook} from '@testing-library/react';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {useTableScreen} from '@/components/mahjong/use-table-screen';
let fullscreen:Element|null,media:MediaQueryList;
let request:ReturnType<typeof vi.fn>,exit:ReturnType<typeof vi.fn>,lock:ReturnType<typeof vi.fn>,unlock:ReturnType<typeof vi.fn>;
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
const rotate=(landscape:boolean)=>{Object.defineProperty(media,'matches',{value:landscape,configurable:true});media.dispatchEvent(new Event('change'));};
beforeEach(()=>{
 fullscreen=null;
 media=Object.assign(new EventTarget(),{matches:false,media:'(orientation: landscape)'}) as MediaQueryList;
 vi.stubGlobal('matchMedia',vi.fn(()=>media));
 lock=vi.fn(async()=>{});unlock=vi.fn();
 vi.stubGlobal('screen',{orientation:Object.assign(new EventTarget(),{lock,unlock})});
 Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>fullscreen});
 request=vi.fn(async()=>{fullscreen=document.documentElement;document.dispatchEvent(new Event('fullscreenchange'));});
 exit=vi.fn(async()=>{fullscreen=null;document.dispatchEvent(new Event('fullscreenchange'));});
 Object.defineProperty(document.documentElement,'requestFullscreen',{value:request,configurable:true});
 Object.defineProperty(document,'exitFullscreen',{value:exit,configurable:true});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();delete (document as any).fullscreenElement;delete (document as any).exitFullscreen;delete (document.documentElement as any).requestFullscreen;});
describe('table fullscreen and orientation ownership',()=>{
 it('clears the failed automatic rotation hint after manual landscape rotation',async()=>{
  lock.mockRejectedValue(new Error('unsupported'));const {result}=renderHook(useTableScreen);
  await act(async()=>{await result.current.enter();});expect(result.current.hint).toContain('旋转手机');
  act(()=>rotate(true));expect(result.current.hint).toBe('');expect(result.current.pending).toBe(false);
 });
 it('does not ask an already landscape user to rotate after an unsupported lock',async()=>{
  rotate(true);lock.mockRejectedValue(new Error('unsupported'));const {result}=renderHook(useTableScreen);
  await act(async()=>{await result.current.enter();});expect(result.current.hint).toBe('');
 });
 it('releases its orientation when the user exits fullscreen and does not later exit a foreign fullscreen session',async()=>{
  const {result,unmount}=renderHook(useTableScreen);await act(async()=>{await result.current.enter();});
  fullscreen=null;act(()=>document.dispatchEvent(new Event('fullscreenchange')));expect(unlock).toHaveBeenCalledTimes(1);
  fullscreen=document.documentElement;unmount();expect(exit).not.toHaveBeenCalled();expect(unlock).toHaveBeenCalledTimes(1);
 });
 it('releases its lock when fullscreen is transferred to another element',async()=>{
  const {result,unmount}=renderHook(useTableScreen);await act(async()=>{await result.current.enter();});
  fullscreen=document.createElement('video');act(()=>document.dispatchEvent(new Event('fullscreenchange')));
  expect(unlock).toHaveBeenCalledTimes(1);unmount();expect(exit).not.toHaveBeenCalled();
 });
 it('releases owned fullscreen and orientation on leaving the table',async()=>{
  const {result,unmount}=renderHook(useTableScreen);await act(async()=>{await result.current.enter();});
  expect(lock).toHaveBeenCalledWith('landscape');unmount();expect(exit).toHaveBeenCalledTimes(1);expect(unlock).toHaveBeenCalledTimes(1);
 });
 it('preserves a fullscreen session it did not request',async()=>{
  fullscreen=document.documentElement;const {result,unmount}=renderHook(useTableScreen);
  await act(async()=>{await result.current.enter();});unmount();expect(request).not.toHaveBeenCalled();expect(exit).not.toHaveBeenCalled();expect(unlock).toHaveBeenCalledTimes(1);
 });
 it('deduplicates requests while fullscreen is pending',async()=>{
  const pending=deferred();request.mockImplementation(async()=>{await pending.promise;fullscreen=document.documentElement;});
  const {result}=renderHook(useTableScreen);let entry!:Promise<void>;
  act(()=>{entry=result.current.enter();});expect(result.current.pending).toBe(true);
  await act(async()=>{await result.current.enter();});expect(request).toHaveBeenCalledTimes(1);
  await act(async()=>{pending.resolve();await entry;});expect(result.current.pending).toBe(false);expect(lock).toHaveBeenCalledTimes(1);
 });
 it('cleans a fullscreen request that resolves after unmount without acquiring orientation',async()=>{
  const pending=deferred();request.mockImplementation(async()=>{await pending.promise;fullscreen=document.documentElement;});
  const {result,unmount}=renderHook(useTableScreen);let entry!:Promise<void>;
  act(()=>{entry=result.current.enter();});unmount();await act(async()=>{pending.resolve();await entry;});expect(exit).toHaveBeenCalledTimes(1);expect(lock).not.toHaveBeenCalled();
 });
 it('releases a late orientation lock when fullscreen was already exited',async()=>{
  const pending=deferred();lock.mockImplementation(()=>pending.promise);
  const {result}=renderHook(useTableScreen);let entry!:Promise<void>;
  await act(async()=>{entry=result.current.enter();await Promise.resolve();});
  fullscreen=null;act(()=>document.dispatchEvent(new Event('fullscreenchange')));
  await act(async()=>{pending.resolve();await entry;});expect(unlock).toHaveBeenCalledTimes(1);expect(result.current.pending).toBe(false);
 });
});
