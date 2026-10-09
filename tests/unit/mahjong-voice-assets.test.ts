import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {loadMahjongVoices} from '@/components/mahjong/voice-samples';
const folder='public/audio/mahjong/voices/';
const provenance=JSON.parse(readFileSync(folder+'provenance.json','utf8'));
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('distributed declaration voice assets',()=>{
 for(const kind of ['riichi','ron','tsumo','chi','pon','kan','north'])it(`${kind} is finite, audible, unclipped PCM with matching provenance`,()=>{
  const row=provenance.samples.find((s:{kind:string})=>s.kind===kind),bytes=readFileSync(folder+kind+'.wav');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
  expect(bytes.toString('ascii',0,4)).toBe('RIFF');expect(bytes.toString('ascii',8,16)).toBe('WAVEfmt ');
  expect(bytes.readUInt16LE(20)).toBe(1);expect(bytes.readUInt16LE(22)).toBe(1);expect(bytes.readUInt32LE(24)).toBe(24000);expect(bytes.readUInt16LE(34)).toBe(16);
  expect(bytes.readUInt32LE(40)).toBe(bytes.length-44);expect(bytes.length).toBe(row.bytes);
  const values=Array.from({length:(bytes.length-44)/2},(_,i)=>bytes.readInt16LE(44+i*2)/32768);
  const duration=values.length/24000,peak=Math.max(...values.map(Math.abs)),rms=Math.sqrt(values.reduce((sum,x)=>sum+x*x,0)/values.length);
  expect(duration).toBeCloseTo(row.seconds,8);expect(duration).toBeGreaterThan(.3);expect(duration).toBeLessThan(1);
  expect(peak).toBeGreaterThan(.5);expect(peak).toBeLessThan(.7);expect(rms).toBeGreaterThan(.01);expect(rms).toBeLessThan(.35);
  expect(values[0]).toBe(0);expect(values.at(-1)).toBe(0);
 });
 it('ships license and provenance without the generation model',()=>{
  expect(readFileSync('public/licenses/Kokoro/LICENSE.txt','utf8')).toContain('Apache License');
  expect(readFileSync('public/licenses/Kokoro/NOTICE.txt','utf8')).toContain(provenance.revision);
  expect(provenance.productionInference).toBe(false);expect(provenance.vendorAssetsUsed).toBe(false);
 });
});
it('bounds stalled network loading and cancels all sibling requests',async()=>{
 vi.useFakeTimers();const signals:AbortSignal[]=[];
 vi.stubGlobal('fetch',vi.fn((_path:string,options:{signal:AbortSignal})=>{signals.push(options.signal);return new Promise(()=>{});}));
 const pending=loadMahjongVoices({} as AudioContext,new AbortController().signal);
 const result=expect(pending).rejects.toThrow('cancelled');await vi.advanceTimersByTimeAsync(10000);await result;
 expect(signals).toHaveLength(7);expect(signals.every(s=>s.aborted)).toBe(true);
});
it('bounds a stalled decoder after successful fetch',async()=>{
 vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(100)})));
 const decoder=vi.fn(()=>new Promise(()=>{}));const pending=loadMahjongVoices({decodeAudioData:decoder} as unknown as AudioContext,new AbortController().signal);
 const result=expect(pending).rejects.toThrow('cancelled');await vi.advanceTimersByTimeAsync(10000);await result;expect(decoder).toHaveBeenCalledTimes(7);
});
it('a disposed player can abort preload immediately, including before fetching',async()=>{
 const controller=new AbortController();controller.abort();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await expect(loadMahjongVoices({} as AudioContext,controller.signal)).rejects.toThrow('cancelled');expect(fetcher).not.toHaveBeenCalled();
});
for(const invalid of ['http','size','stereo','duration'])it(`rejects ${invalid} assets without usable buffers`,async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:invalid!=='http',arrayBuffer:async()=>new ArrayBuffer(invalid==='size'?129000:100)})));
 const decoder=vi.fn(async()=>({duration:invalid==='duration'?10:.6,numberOfChannels:invalid==='stereo'?2:1}));
 await expect(loadMahjongVoices({decodeAudioData:decoder} as unknown as AudioContext,new AbortController().signal)).rejects.toThrow();
});
