import {describe,expect,it,vi} from 'vitest';
import {TableAudioPlayer} from '@/components/mahjong/table-audio';
import type {TableSoundEvent} from '@/components/mahjong/table-sounds';
const cue=(id='one'):TableSoundEvent=>({id,kind:'discard',seat:0});
function context(){
 const sources:Array<{buffer:unknown;onended:(()=>void)|null;connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>;start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>}>=[];
 const ctx={state:'suspended',sampleRate:48000,currentTime:0,destination:{},resume:vi.fn(async()=>{ctx.state='running';}),suspend:vi.fn(async()=>{ctx.state='suspended';}),close:vi.fn(async()=>{ctx.state='closed';}),createGain:vi.fn(()=>({gain:{value:0},connect:vi.fn(),disconnect:vi.fn()})),createBuffer:vi.fn((_c:number,n:number)=>({getChannelData:()=>new Float32Array(n)})),createBufferSource:vi.fn(()=>{const s={buffer:null as unknown,onended:null as (()=>void)|null,connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};sources.push(s);return s;})};
 return {ctx,sources,create:vi.fn(()=>ctx as unknown as AudioContext)};
}
describe('finite table audio lifecycle',()=>{
 it('starts a delayed score roll from the remaining visual segment and consumes expired cues',async()=>{
  const f=context(),p=new TableAudioPlayer(f.create);await p.unlock();
  expect(p.play({id:'roll',kind:'score-roll',seat:0},.9)).toBe(true);
  expect(f.sources[0].start).toHaveBeenCalledWith(0,.9);
  for(const offset of [.99,1,NaN,-1])expect(p.play({id:`expired-${offset}`,kind:'score-roll',seat:0},offset)).toBe(false);
  expect(f.sources).toHaveLength(1);expect(p.play({id:'expired-1',kind:'score-roll',seat:0})).toBe(false);
  await p.dispose();
 });
 it('does not create a context or queue sounds before a gesture unlock',()=>{const f=context(),p=new TableAudioPlayer(f.create);expect(p.play(cue())).toBe(false);expect(f.create).not.toHaveBeenCalled();expect(f.sources).toHaveLength(0);});
 it('plays a live cue once and releases the completed node',async()=>{const f=context(),p=new TableAudioPlayer(f.create);expect(await p.unlock()).toBe(true);expect(p.play(cue())).toBe(true);expect(p.play(cue())).toBe(false);expect(f.sources).toHaveLength(1);f.sources[0].onended!();expect(f.sources[0].disconnect).toHaveBeenCalled();await p.dispose();expect(f.sources[0].stop).not.toHaveBeenCalled();});
 it('does not replay a discarded locked cue when unlocking later',async()=>{const f=context(),p=new TableAudioPlayer(f.create);p.play(cue());await p.unlock();expect(p.play(cue())).toBe(false);expect(p.play(cue('new'))).toBe(true);});
 it('mute immediately stops sound, does not queue and requires a new unlock',async()=>{const f=context(),p=new TableAudioPlayer(f.create);await p.unlock();p.play(cue());p.setEnabled(false);expect(f.sources[0].stop).toHaveBeenCalledOnce();expect(p.play(cue('muted'))).toBe(false);p.setEnabled(true);expect(p.play(cue('still-locked'))).toBe(false);await p.unlock();expect(p.play(cue('muted'))).toBe(false);expect(p.play(cue('live'))).toBe(true);});
 it('background pause stops sound and drops intervening cues',async()=>{const f=context(),p=new TableAudioPlayer(f.create);await p.unlock();p.play(cue());p.pause();expect(f.sources[0].stop).toHaveBeenCalledOnce();expect(p.play(cue('away'))).toBe(false);await p.unlock();expect(p.play(cue('away'))).toBe(false);expect(p.play(cue('returned'))).toBe(true);});
 it('unmount closes the context and cannot reopen it',async()=>{const f=context(),p=new TableAudioPlayer(f.create);await p.unlock();p.play(cue());await p.dispose();expect(f.sources[0].stop).toHaveBeenCalledOnce();expect(f.ctx.close).toHaveBeenCalledOnce();expect(await p.unlock()).toBe(false);expect(p.play(cue('late'))).toBe(false);expect(f.create).toHaveBeenCalledOnce();});
 it('handles denied browser permission without throwing or repeatedly creating contexts',async()=>{const f=context();f.ctx.resume.mockRejectedValue(new Error('NotAllowedError'));const p=new TableAudioPlayer(f.create);expect(await p.unlock()).toBe(false);expect(p.play(cue())).toBe(false);expect(await p.unlock()).toBe(false);expect(f.create).toHaveBeenCalledOnce();});
 it('cannot reactivate after disposal while resume is pending',async()=>{const f=context();let resolve!:()=>void;f.ctx.resume.mockImplementation(()=>new Promise<void>(r=>{resolve=r;}));const p=new TableAudioPlayer(f.create),permission=p.unlock();expect(resolve).toBeTypeOf('function');await p.dispose();f.ctx.state='running';resolve();expect(await permission).toBe(false);expect(p.play(cue())).toBe(false);});
 it('caps overlapping source nodes and caches the original wave buffer',async()=>{const f=context(),p=new TableAudioPlayer(f.create);await p.unlock();for(let n=0;n<12;n++)p.play(cue(String(n)));expect(f.sources.filter(s=>!s.stop.mock.calls.length)).toHaveLength(8);expect(f.ctx.createBuffer).toHaveBeenCalledOnce();await p.dispose();expect(f.sources.every(s=>s.disconnect.mock.calls.length>0)).toBe(true);});
});

it('a new hand cancels sources while preserving the already unlocked context',async()=>{const f=context(),p=new TableAudioPlayer(f.create);await p.unlock();p.play(cue());expect(p.cancel).toBeTypeOf('function');p.cancel();expect(f.sources[0].stop).toHaveBeenCalledOnce();expect(p.play(cue('new-hand'))).toBe(true);expect(f.ctx.suspend).not.toHaveBeenCalled();});

it('disposal closes directly without queuing another suspension',async()=>{const f=context(),p=new TableAudioPlayer(f.create);await p.unlock();p.setEnabled(false);expect(f.ctx.suspend).toHaveBeenCalledOnce();await p.dispose();expect(f.ctx.suspend).toHaveBeenCalledOnce();expect(f.ctx.close).toHaveBeenCalledOnce();});

it('awaits an in-flight suspension before closing so WebKit cannot restore suspended state afterward',async()=>{const f=context();let finish!:()=>void;f.ctx.suspend.mockImplementation(()=>new Promise<void>(resolve=>{finish=()=>{f.ctx.state='suspended';resolve();};}));const p=new TableAudioPlayer(f.create);await p.unlock();p.setEnabled(false);const closing=p.dispose();expect(f.ctx.close).not.toHaveBeenCalled();finish();await closing;expect(f.ctx.state).toBe('closed');expect(f.ctx.close).toHaveBeenCalledOnce();});

it('uses a preloaded fixed declaration voice at the existing cue time',async()=>{
 const f=context(),voice={duration:.72} as AudioBuffer,load=vi.fn(async()=>({riichi:voice}));
 const p=new TableAudioPlayer(f.create,load);await p.unlock();await vi.waitFor(()=>expect(load).toHaveBeenCalledOnce());await load.mock.results[0].value;await Promise.resolve();
 expect(load).toHaveBeenCalledOnce();expect(p.play({id:'voiced-riichi',kind:'riichi',seat:0})).toBe(true);expect(f.sources[0].buffer).toBe(voice);
 await p.dispose();
});

it('loading late never queues or replays a consumed declaration',async()=>{
 const f=context(),voice={duration:.7} as AudioBuffer;let finish!:(value:{riichi:AudioBuffer})=>void;
 const load=vi.fn(()=>new Promise<{riichi:AudioBuffer}>(r=>{finish=r;}));const p=new TableAudioPlayer(f.create,load);await p.unlock();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 expect(p.play({id:'early',kind:'riichi',seat:0})).toBe(true);expect(f.sources[0].buffer).not.toBe(voice);
 finish({riichi:voice});await load.mock.results[0].value;await Promise.resolve();await Promise.resolve();expect(f.sources).toHaveLength(1);
 expect(p.play({id:'early',kind:'riichi',seat:0})).toBe(false);expect(p.play({id:'next',kind:'riichi',seat:0})).toBe(true);expect(f.sources[1].buffer).toBe(voice);await p.dispose();
});

it('muting while voice bytes load leaves playback silent after they arrive',async()=>{
 const f=context(),voice={duration:.7} as AudioBuffer;let finish!:(value:{ron:AudioBuffer})=>void;
 const load=vi.fn(()=>new Promise<{ron:AudioBuffer}>(r=>{finish=r;}));const p=new TableAudioPlayer(f.create,load);await p.unlock();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));p.setEnabled(false);
 finish({ron:voice});await load.mock.results[0].value;await Promise.resolve();await Promise.resolve();expect(p.play({id:'muted',kind:'ron',seat:0})).toBe(false);expect(f.sources).toHaveLength(0);
 p.setEnabled(true);await p.unlock();expect(p.play({id:'muted',kind:'ron',seat:0})).toBe(false);expect(p.play({id:'new',kind:'ron',seat:0})).toBe(true);expect(f.sources[0].buffer).toBe(voice);await p.dispose();
});

it('disposal aborts voice loading and ignores late decoder results',async()=>{
 const f=context(),voice={duration:.7} as AudioBuffer;let finish!:(value:{tsumo:AudioBuffer})=>void,signal!:AbortSignal;
 const load=vi.fn((_context:AudioContext,s:AbortSignal)=>{signal=s;return new Promise<{tsumo:AudioBuffer}>(r=>{finish=r;});});const p=new TableAudioPlayer(f.create,load);await p.unlock();await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));await p.dispose();expect(signal.aborted).toBe(true);
 finish({tsumo:voice});await load.mock.results[0].value;await Promise.resolve();expect(p.play({id:'retired',kind:'tsumo',seat:0})).toBe(false);expect(f.sources).toHaveLength(0);expect(f.ctx.close).toHaveBeenCalledOnce();
});

it('failed preload preserves due tones and retries on a new trusted unlock',async()=>{
 const f=context(),voice={duration:.7} as AudioBuffer,load=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({ron:voice});const p=new TableAudioPlayer(f.create,load);await p.unlock();await new Promise(r=>setTimeout(r,0));
 expect(p.play({id:'offline-ron',kind:'ron',seat:0})).toBe(true);expect(f.sources[0].buffer).not.toBe(voice);
 await p.unlock();await new Promise(r=>setTimeout(r,0));expect(load).toHaveBeenCalledTimes(2);expect(p.play({id:'offline-ron',kind:'ron',seat:0})).toBe(false);expect(p.play({id:'fresh-ron',kind:'ron',seat:0})).toBe(true);expect(f.sources[1].buffer).toBe(voice);await p.dispose();
});

it('concurrent unlocks load voices once and keep the existing eight-source cap',async()=>{
 const f=context(),voice={duration:.7} as AudioBuffer,load=vi.fn(async()=>({tsumo:voice}));const p=new TableAudioPlayer(f.create,load);await Promise.all([p.unlock(),p.unlock()]);await new Promise(r=>setTimeout(r,0));
 expect(load).toHaveBeenCalledOnce();expect(f.create).toHaveBeenCalledOnce();for(let n=0;n<12;n++)expect(p.play({id:'voice-'+n,kind:'tsumo',seat:0})).toBe(true);
 expect(f.sources.filter(s=>!s.stop.mock.calls.length)).toHaveLength(8);expect(f.sources.every(s=>s.buffer===voice)).toBe(true);await p.dispose();expect(f.sources.every(s=>s.disconnect.mock.calls.length)).toBe(true);
});
