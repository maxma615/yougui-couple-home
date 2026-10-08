import denseGeometry from '../fixtures/mahjong-dense-action-geometry.json';
import {describe,it,expect} from 'vitest';
import {placeMahjongActions,rectanglesOverlap,buildObstacleHitTest,type PlacementRect} from '../../src/components/mahjong/action-placement';
const bounds={x:8,y:8,w:651,h:359};
const overlap=(a:PlacementRect,b:PlacementRect)=>rectanglesOverlap(a,b,2);
describe('contextual action placement',()=>{
 it('checks fractional edges and thin projected faces exactly with cached obstacle edges',()=>{
  const obstacles=[{x:15.25,y:18.6,w:5.1,h:2.2},{x:80.7,y:45.3,w:42.6,h:16.1},{x:-5,y:8,w:24,h:50}];
  const blocked=buildObstacleHitTest(obstacles);
  for(let x=5.2;x<150;x+=3.7)for(let y=4.3;y<90;y+=4.9){const a={x,y,w:13.8,h:17.6};expect(blocked(a)).toBe(obstacles.some(b=>overlap(a,b)));}
 });
 it('keeps a valid layout exactly where it is',()=>{
  const actions=[{id:'nuki',x:130,y:250,w:66,h:44},{id:'kan',x:400,y:250,w:131,h:44}];
  expect(placeMahjongActions(actions,[{x:280,y:140,w:90,h:80}],bounds)).toEqual(actions);
 });
 it('moves real-sized previews clear of dense table regions without changing sizes or order',()=>{
  const obstacles=[{x:8,y:8,w:120,h:82},{x:518,y:12,w:134,h:44},{x:210,y:4,w:246,h:36},{x:240,y:106,w:188,h:15},{x:292,y:160,w:82,h:70},{x:224,y:182,w:42,h:58},{x:380,y:210,w:68,h:30},{x:270,y:258,w:128,h:46},{x:516,y:281,w:80,h:35},{x:100,y:315,w:467,h:52}];
  const actions=[{id:'ron',x:127,y:235,w:59,h:44},{id:'chi',x:205,y:60,w:257,h:44},{id:'pon',x:127,y:186,w:113,h:44},{id:'kan',x:401,y:219,w:133,h:44},{id:'pass',x:191,y:235,w:49,h:44}];
  const placed=placeMahjongActions(actions,obstacles,bounds);
  expect(placed).not.toBeNull();
  for(const [i,a] of placed!.entries()){
   expect([a.id,a.w,a.h]).toEqual([actions[i].id,actions[i].w,actions[i].h]);
   expect(a.x).toBeGreaterThanOrEqual(bounds.x);expect(a.y).toBeGreaterThanOrEqual(bounds.y);
   expect(a.x+a.w).toBeLessThanOrEqual(bounds.x+bounds.w);expect(a.y+a.h).toBeLessThanOrEqual(bounds.y+bounds.h);
   expect(obstacles.some(b=>overlap(a,b))).toBe(false);
   expect(placed!.some((b,j)=>j!==i&&overlap(a,b))).toBe(false);
  }
  expect(placeMahjongActions(actions,obstacles,bounds)).toEqual(placed);
 });
 it('packs the captured 667px late response, where a clear arrangement exists',()=>{
  const {actions,obstacles,bounds}=denseGeometry;
  const witness=actions.map((a,i)=>({...a,...[{x:137,y:8},{x:205.109375,y:60},{x:137,y:242},{x:464,y:60},{x:467,y:8}][i]}));
  expect(witness.every((a,i)=>!obstacles.some(b=>overlap(a,b))&&!witness.some((b,j)=>i!==j&&overlap(a,b)))).toBe(true);
  const placed=placeMahjongActions(actions,obstacles,bounds);expect(placed).not.toBeNull();
  expect(placed!.every((a,i)=>!obstacles.some(b=>overlap(a,b))&&!placed!.some((b,j)=>j!==i&&overlap(a,b)))).toBe(true);
 });
 it('reports impossible space without hiding or resizing actions',()=>{
  expect(placeMahjongActions([{id:'win',x:0,y:0,w:44,h:44}],[{x:0,y:0,w:100,h:100}],{x:0,y:0,w:100,h:100})).toBeNull();
 });
});
