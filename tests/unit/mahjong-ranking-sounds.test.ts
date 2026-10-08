import {it,expect} from 'vitest';
import {acceptedRankingSounds} from '@/components/mahjong/ranking-sounds';
import {makeTileSoundBuffer} from '@/components/mahjong/table-audio';
import {rankingPair} from '../fixtures/mahjong-ranking-game';
it.each(['sanma','yonma'] as const)('accepts native %s human and computer final ACKs with separate row identities',variant=>{
 for(const bot of [false,true]){
  const f=rankingPair(variant,bot),cues=acceptedRankingSounds(f.before,f.after),rows=f.after.game!.ranking!;
  expect(cues).toHaveLength(rows.length);expect(cues.map(c=>c.seat)).toEqual(rows.slice().sort((a,b)=>a.rank-b.rank).map(r=>r.seat));
  expect(cues.map(c=>c.atMs)).toEqual(rows.map((_,i)=>1800+i*800));expect(cues[0].kind).toBe('rank-first');expect(cues.slice(1).every(c=>c.kind==='rank-row')).toBe(true);
  expect(new Set(cues.map(c=>c.id)).size).toBe(rows.length);expect(acceptedRankingSounds(f.after,f.after)).toEqual([]);
 }
});
it.each(['initial','late','missed','scope','duplicate-seat','duplicate-rank','invalid-score','invalid-age','wrong-flow','unfinished'] as const)('rejects %s final sound reconstruction',mode=>{
 const f=rankingPair('yonma'),after=structuredClone(f.after);
 if(mode==='initial'){expect(acceptedRankingSounds(null,after)).toEqual([]);return;}
 if(mode==='late')after.game!.rankingFlow!.elapsedMs=1800;
 if(mode==='missed')after.version++;
 if(mode==='scope')after.game!.gameInstanceId='another';
 if(mode==='duplicate-seat')after.game!.ranking![1].seat=after.game!.ranking![0].seat;
 if(mode==='duplicate-rank')after.game!.ranking![1].rank=1;
 if(mode==='invalid-score')after.game!.ranking![1].score=NaN;
 if(mode==='invalid-age')after.game!.rankingFlow!.elapsedMs=-1;
 if(mode==='wrong-flow')after.game!.rankingFlow!.id='wrong';
 if(mode==='unfinished')after.status='playing';
 expect(acceptedRankingSounds(f.before,after)).toEqual([]);
});
it.each(['rank-first','rank-row'] as const)('creates finite, original %s wave with a silent tail',kind=>{
 let samples!:Float32Array;const c={sampleRate:48000,createBuffer:(_channels:number,n:number)=>{samples=new Float32Array(n);return {getChannelData:()=>samples};}};
 makeTileSoundBuffer(c as unknown as BaseAudioContext,kind);
 expect(samples.every(Number.isFinite)).toBe(true);const peak=Math.max(...samples.map(Math.abs));expect(peak).toBeGreaterThan(.05);expect(peak).toBeLessThan(.5);expect(Math.abs(samples.at(-1)!)).toBeLessThan(.001);expect(samples.length/48000).toBeLessThanOrEqual(.26);
});
