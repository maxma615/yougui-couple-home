import {describe,it,expect} from 'vitest';
import {tablePoint,tableDelta,tableRect,type TableSpace} from '@/components/mahjong/table-space';
const portrait:TableSpace={rotated:true,left:12,top:23,right:402,width:844,height:390};
const landscape:TableSpace={rotated:false,left:12,top:23,right:856,width:844,height:390};
describe('landscape table coordinate frame',()=>{
 it('maps portrait viewport corners to the corresponding logical landscape corners',()=>{
  expect(tablePoint(portrait,402,23)).toEqual({x:0,y:0});
  expect(tablePoint(portrait,12,867)).toEqual({x:844,y:390});
 });
 it('maps a physical rightward drag to local upward movement without changing its length',()=>{
  expect(tableDelta(portrait,60,-24)).toEqual({x:-24,y:-60});
  expect(tableDelta(landscape,60,-24)).toEqual({x:60,y:-24});
 });
 it('preserves local rack bounds after rotation, including nonzero viewport origins',()=>{
  expect(tableRect(portrait,{left:22,right:72,top:123,bottom:723,width:50,height:600})).toEqual({x:100,y:330,w:600,h:50});
  expect(tableRect(landscape,{left:112,right:712,top:353,bottom:403,width:600,height:50})).toEqual({x:100,y:330,w:600,h:50});
 });
 it('keeps invalid pointer coordinates invalid so they cannot pass a discard threshold',()=>{
  expect(Number.isFinite(tablePoint(portrait,NaN,123).y)).toBe(false);
 });
});
