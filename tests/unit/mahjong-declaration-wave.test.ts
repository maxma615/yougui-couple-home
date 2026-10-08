import {expect,it} from 'vitest';
import {makeTileSoundBuffer} from '@/components/mahjong/table-audio';
it.each(['riichi','ron','tsumo'] as const)('generates an original finite %s cue with safe headroom',kind=>{
 let samples=new Float32Array();
 const context={sampleRate:48000,createBuffer:(_channels:number,length:number)=>{samples=new Float32Array(length);return {getChannelData:()=>samples};}} as unknown as BaseAudioContext;
 makeTileSoundBuffer(context,kind);
 expect(samples.length).toBeGreaterThanOrEqual(12000);expect(samples.length).toBeLessThanOrEqual(24000);
 expect([...samples].every(Number.isFinite)).toBe(true);
 const peak=Math.max(...samples.map(Math.abs));expect(peak).toBeGreaterThan(.05);expect(peak).toBeLessThan(.75);
 expect(Math.abs(samples.at(-1)!)).toBeLessThan(.001);
});
