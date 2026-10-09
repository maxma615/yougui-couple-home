import {it,expect} from 'vitest';
import {tileMatchKey} from '@/components/mahjong/mahjong-tile';
it.each(['m','p','s'])('treats red and ordinary %s fives as the same family while retaining native face values',suit=>{
 expect(tileMatchKey(suit+'0')).toBe(suit+'5');expect(tileMatchKey(suit+'5_')).toBe(suit+'5');
 expect(tileMatchKey(suit+'4*')).toBe(suit+'4');
});
it.each(['z1','z4','z7'])('matches visible %s honors without conflating seats',tile=>expect(tileMatchKey(tile+'_*')).toBe(tile));
it.each([null,undefined,'','back','z0','z8','m10','p5invalid','x1'])('has no family for an absent or malformed face %s',value=>expect(tileMatchKey(value)).toBeNull());
