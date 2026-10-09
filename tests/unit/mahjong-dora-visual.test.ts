import {it,expect} from 'vitest';
import Majiang from '@kobalab/majiang-core';
import {indicatorBonus,visibleDoraFamilies} from '@/components/mahjong/mahjong-tile';
it.each(['m','p','s','z'].flatMap(suit=>Array.from({length:suit==='z'?7:10},(_,rank)=>suit+(suit==='z'?rank+1:rank))))('matches native four-player bonus succession for %s',tile=>{
 expect(indicatorBonus(tile,'yonma')).toBe(Majiang.Shan.zhenbaopai(tile));
});
it('keeps the removed manzu gap specific to three-player tables',()=>{
 expect(visibleDoraFamilies(['m1','m9','z4','z7','p0','s9'],'sanma')).toEqual(['m9','m1','z1','z5','p6','s1']);
 expect(visibleDoraFamilies(['m1','m9'],'yonma')).toEqual(['m2','m1']);
});
it('uses only exposed indicators, de-duplicates display families and preserves the source',()=>{
 const indicators=Object.freeze(['p4','p4','s9','z4']);
 expect(visibleDoraFamilies(indicators,'yonma')).toEqual(['p5','s1','z1']);
 expect(indicators).toEqual(['p4','p4','s9','z4']);
});
it('rejects absent or impossible indicators rather than inventing a glowing tile',()=>{
 expect(visibleDoraFamilies(['','back','z0','z8','m10','p5invalid'],'yonma')).toEqual([]);
 expect(visibleDoraFamilies(['m0','m2','m8'],'sanma')).toEqual([]);
});
