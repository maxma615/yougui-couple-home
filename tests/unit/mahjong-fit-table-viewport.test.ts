import {describe,it,expect} from 'vitest';
import {fitTableViewport} from '@/components/mahjong/fit-table-viewport';
describe('centered integer 16:9 table frame',()=>{
  it.each([
    [375,667,true,666,375],
    [390,844,true,693,390],
    [412,915,true,732,412],
    [768,1024,true,1024,576],
    [844,390,false,693,390],
    [1440,810,false,1440,810],
    [390,844,false,390,219],
    [1920,1200,false,1920,1080],
  ])('fits %s × %s rotated=%s without stretching', (w,h,rotated,width,height)=>{
    expect(fitTableViewport(w,h,rotated)).toEqual({width,height,rotated});
  });
  it.each([0,-1,NaN,Infinity])('rejects invalid physical dimensions %s',value=>{
    expect(fitTableViewport(value,844,true)).toBeNull();
    expect(fitTableViewport(390,value,false)).toBeNull();
  });
});
