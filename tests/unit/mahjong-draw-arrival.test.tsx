// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDrawArrival } from "@/components/mahjong/use-draw-arrival";
import type { GameView } from "@/modules/mahjong/types";

const view = (overrides: Partial<GameView> = {}): GameView => ({ gameInstanceId:"game-a",handId:1,decisionId:"a",phase:"dapai",roundWind:0,roundNumber:1,honba:0,riichiSticks:0,remainingTiles:60,doraIndicators:["p1"],turnSeat:1,hand:["p1"],drawnTile:null,players:[],choices:[],settlement:null,ranking:null,...overrides });
const live={connected:true,canAnimate:true};
const quiet={connected:true,canAnimate:false};
const draw=view({decisionId:"b",phase:"zimo",turnSeat:0,drawnTile:"p2"});
const initial={game:view(),room:"room-a",seat:0,source:live};
const hook=(p:typeof initial)=>useDrawArrival(p.game,p.room,p.seat,p.source);

describe("draw arrival follows live decisions rather than displayed state",()=>{
 afterEach(()=>{cleanup();vi.useRealTimers();});
 it("does not replay a drawn tile on first mount",()=>{
  const {result}=renderHook(hook,{initialProps:{...initial,game:draw}});
  expect(result.current.arriving).toBe(false);
 });
 it.each(["zimo","gangzimo","nukizimo"])("animates one live %s arrival",phase=>{
  vi.useFakeTimers();
  const {result,rerender}=renderHook(hook,{initialProps:initial});
  rerender({...initial,game:{...draw,phase}});expect(result.current.arriving).toBe(true);
  act(()=>vi.advanceTimersByTime(220));expect(result.current.arriving).toBe(false);
  rerender({...initial,game:{...draw,phase}});expect(result.current.arriving).toBe(false);
 });
 it("baselines quiet GET without replaying it when live delivery resumes",()=>{
  const {result,rerender}=renderHook(hook,{initialProps:initial});
  rerender({...initial,game:draw,source:quiet});expect(result.current.arriving).toBe(false);
  rerender({...initial,game:draw});expect(result.current.arriving).toBe(false);
  rerender({...initial,game:{...draw,decisionId:"c",phase:"nukizimo"}});expect(result.current.arriving).toBe(true);
 });
 it("clears a current arrival on disconnect and baselines the reconnect snapshot",()=>{
  const {result,rerender}=renderHook(hook,{initialProps:initial});
  rerender({...initial,game:draw});expect(result.current.arriving).toBe(true);
  rerender({...initial,game:draw,source:{connected:false,canAnimate:true}});expect(result.current.arriving).toBe(false);
  rerender({...initial,game:{...draw,decisionId:"c"}});expect(result.current.arriving).toBe(false);
  rerender({...initial,game:{...draw,decisionId:"d"}});expect(result.current.arriving).toBe(true);
 });
 it.each([
  {room:"room-b"}, {seat:1}, {game:{...draw,gameInstanceId:"game-b"}}, {game:{...draw,handId:2}},
 ])("baselines scope changes %j",override=>{
  const {result,rerender}=renderHook(hook,{initialProps:initial});
  rerender({...initial,game:draw,...override});expect(result.current.arriving).toBe(false);
 });
 it.each([
  {turnSeat:1}, {phase:"dapai"}, {drawnTile:null}, {gameInstanceId:undefined}, {handId:undefined},
 ])("does not animate a non-draw or unverifiable snapshot %j",override=>{
  const {result,rerender}=renderHook(hook,{initialProps:initial});
  rerender({...initial,game:{...draw,...override}});expect(result.current.arriving).toBe(false);
 });
 it("clears an in-flight draw when a quiet snapshot arrives",()=>{
  const {result,rerender}=renderHook(hook,{initialProps:initial});
  rerender({...initial,game:draw});expect(result.current.arriving).toBe(true);
  rerender({...initial,game:draw,source:quiet});expect(result.current.arriving).toBe(false);
  rerender({...initial,game:draw});expect(result.current.arriving).toBe(false);
 });
 it("cancels arrival immediately on interaction and does not replay a duplicate",()=>{
  vi.useFakeTimers();const {result,rerender}=renderHook(hook,{initialProps:initial});
  rerender({...initial,game:draw});expect(result.current.arriving).toBe(true);
  act(()=>result.current.cancel());expect(result.current.arriving).toBe(false);
  rerender({...initial,game:draw});expect(result.current.arriving).toBe(false);
  act(()=>vi.advanceTimersByTime(220));expect(result.current.arriving).toBe(false);
 });

});
