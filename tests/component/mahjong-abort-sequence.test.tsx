// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, render, screen} from "@testing-library/react";
import {GameRoom} from "@/components/mahjong/mahjong-client";
import {MahjongSettlementPanel} from "@/components/mahjong/mahjong-settlement-panel";
import {SettlementSequenceGame} from "@/modules/mahjong/settlement-sequence";
import {drawRevealAt, drawSummaryAt, confirmationAt} from "@/components/mahjong/settlement-presentation";
import type {RoomView} from "@/modules/mahjong/types";
import {abortEngine, playAbort, type AbortKind} from "../fixtures/mahjong-abort-game";

beforeEach(()=>vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]}));
afterEach(()=>{cleanup();vi.useRealTimers();});
const tick=(ms:number)=>act(()=>vi.advanceTimersByTime(ms));
function setup(kind:AbortKind, ownSeat=0, declare=false, dealer=0) {
  const game=new SettlementSequenceGame(abortEngine(kind,"yonma",dealer,declare),4);
  playAbort(game,kind,dealer,declare);
  const room:RoomView={id:"abort-table",code:"ABCDEFGH",hostUserId:"0",variant:"yonma",mode:"east",status:"playing",version:1,mySeat:ownSeat,
    members:Array.from({length:4},(_,seat)=>({userId:String(seat),displayName:`玩家${seat}`,seat,kind:"human",ready:true,connected:true})),game:game.view(ownSeat)};
  const onChoice=vi.fn();
  return {game,room,onChoice};
}
const mount=(room:RoomView,onChoice=vi.fn())=>render(<GameRoom room={room} host={false} busy={false} ownSeat={room.mySeat!} connected motionCanAnimate={false} onChoice={onChoice} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/>);
it.each([
  ["nine",false,500,1000], ["winds",false,500,1000], ["kans",false,500,1000],
  ["kans",true,1000,1500], ["riichi",false,1000,2000], ["ron",false,2000,3000], ["ron",true,2500,3500],
] as const)("%s declared=%s uses native branch boundaries",(kind,declare,reveal,cause)=>{
  const {room}=setup(kind,0,declare),v=room.game!;
  expect(drawRevealAt(v.settlement!)).toBe(reveal);
  expect(drawSummaryAt(v.settlement!)).toBe(cause);
  expect(confirmationAt(v.settlementFlow!,v.settlement!)).toBe(cause+1000);
});
it("four riichi flips the public racks at 1000 and opens cause only at 2000",()=>{
  const {room,onChoice}=setup("riichi",0);mount(room,onChoice);
  tick(999);expect(document.querySelector('[data-draw-reveal-seat="1"]')).toBeNull();
  tick(1);expect(document.querySelector('[data-draw-reveal-seat="1"]')).not.toBeNull();
  expect(screen.queryByRole('region',{name:'流局原因'})).toBeNull();
  tick(999);expect(screen.queryByRole('region',{name:'流局原因'})).toBeNull();
  tick(1);expect(screen.getByRole('region',{name:'流局原因'})).toBeTruthy();
  const button=screen.getByRole('button',{name:/继续/}) as HTMLButtonElement;
  tick(999);expect(button.disabled).toBe(true);tick(1);expect(button.disabled).toBe(false);
});
it("triple ron announces actual seats, then exposes only native authorized racks",()=>{
  const {room}=setup("ron",2,false,1);mount(room);
  tick(799);expect(document.querySelector('[data-abort-ron-seat]')).toBeNull();
  tick(1);expect([...document.querySelectorAll('[data-abort-ron-seat]')].map(el=>Number(el.getAttribute('data-abort-ron-seat')))).toEqual([2,3,0]);
  expect(document.querySelector('[data-abort-ron-seat="1"]')).toBeNull();
  tick(899);expect(document.querySelector('[data-abort-ron-seat]')).not.toBeNull();
  tick(1);expect(document.querySelector('[data-abort-ron-seat]')).toBeNull();
  expect(document.querySelector('[data-draw-reveal-seat]')).toBeNull();
  tick(300);expect(document.querySelector('[data-draw-reveal-seat="0"]')).not.toBeNull();
  expect(document.querySelector('[data-draw-reveal-seat="3"]')).not.toBeNull();
  expect(document.querySelector('[data-draw-reveal-seat="1"]')).toBeNull();
  expect(screen.queryByRole('region',{name:'流局原因'})).toBeNull();
  tick(1000);expect(screen.getByRole('region',{name:'流局原因'})).toBeTruthy();
});
it("reconnected old triple-ron snapshots keep passed declarations hidden",()=>{
 const {room}=setup('ron');room.game!.settlementFlow!.elapsedMs=2900;
 const {rerender}=mount(room);expect(document.querySelector('[data-abort-ron-seat]')).toBeNull();
 tick(100);expect(screen.getByRole('region',{name:'流局原因'})).toBeTruthy();
 room.game={...room.game!,settlementFlow:{...room.game!.settlementFlow!,elapsedMs:0}};
 rerender(<GameRoom room={room} host={false} busy={false} ownSeat={0} connected motionCanAnimate={false} onChoice={()=>{}} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/>);
 expect(document.querySelector('[data-abort-ron-seat]')).toBeNull();
 expect(screen.getByRole('region',{name:'流局原因'})).toBeTruthy();
});
it("abort cause respects the existing physical discard lead and does not ACK early",()=>{
 const {room,onChoice}=setup('ron');render(<MahjongSettlementPanel game={room.game!} room={room} onChoice={onChoice} connected busy={false} leadInMs={230}/>);
 tick(3000);expect(screen.queryByRole('region',{name:'流局原因'})).toBeNull();tick(230);
 expect(screen.getByRole('region',{name:'流局原因'})).toBeTruthy();
 tick(999);expect((screen.getByRole('button',{name:/继续/}) as HTMLButtonElement).disabled).toBe(true);
 tick(1);expect((screen.getByRole('button',{name:/继续/}) as HTMLButtonElement).disabled).toBe(false);
 tick(3000);expect(onChoice).toHaveBeenCalledTimes(1);
});
it("native abort transition suppresses the premature generic draw cut-in",()=>{
 const game=new SettlementSequenceGame(abortEngine('ron'),4);
 const {room}=setup('ron');room.game=game.view(0);
 const {rerender}=render(<GameRoom room={room} host={false} busy={false} ownSeat={0} connected motionCanAnimate onChoice={()=>{}} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/>);
 playAbort(game,'ron');room.game=game.view(0);
 rerender(<GameRoom room={room} host={false} busy={false} ownSeat={0} connected motionCanAnimate onChoice={()=>{}} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/>);
 expect(document.querySelector('.mahjong-call-announcement.is-win')).toBeNull();
 expect(screen.queryByRole('region',{name:'流局原因'})).toBeNull();
});
it("the last riichi declaration is seat oriented and cleared before triple ron",()=>{
 const {room}=setup('ron',0,true);mount(room);
 tick(299);expect(document.querySelector('[data-abort-riichi-seat]')).toBeNull();
 tick(1);expect(document.querySelector('[data-abort-riichi-seat="0"]')).not.toBeNull();
 tick(700);expect(document.querySelector('[data-abort-riichi-seat]')).toBeNull();
 tick(300);expect(document.querySelector('[data-abort-ron-seat="1"]')).not.toBeNull();
});
it("legacy four-riichi snapshots keep their longer reveal and summary schedule",()=>{
 const {room}=setup('riichi');delete room.game!.settlement!.drawInfo!.abortPresentation;
 expect(drawRevealAt(room.game!.settlement!)).toBe(1000);expect(drawSummaryAt(room.game!.settlement!)).toBe(2000);
 mount(room);tick(999);expect(document.querySelector('[data-draw-reveal-seat]')).toBeNull();
 tick(1);expect(document.querySelector('[data-draw-reveal-seat]')).not.toBeNull();
 expect(document.querySelector('[data-abort-riichi-seat]')).toBeNull();
});
it("legacy triple ron never guesses declaration seats from hidden roles",()=>{
 const {room}=setup('ron');delete room.game!.settlement!.drawInfo!.abortPresentation;mount(room);
 tick(800);expect(document.querySelector('[data-abort-ron-seat]')).toBeNull();
 tick(1200);expect(document.querySelector('[data-draw-reveal-seat="1"]')).not.toBeNull();
 expect(document.querySelector('[data-draw-reveal-seat="0"]')).toBeNull();
});
it("new native hand resets the cause and cleans up all finite timers on unmount",()=>{
 const {room}=setup('ron');room.game!.settlementFlow!.elapsedMs=3200;
 const {rerender,unmount}=mount(room);expect(screen.getByRole('region',{name:'流局原因'})).toBeTruthy();
 const next=setup('riichi').room;
 rerender(<GameRoom room={next} host={false} busy={false} ownSeat={0} connected motionCanAnimate={false} onChoice={()=>{}} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/>);
 expect(screen.queryByRole('region',{name:'流局原因'})).toBeNull();
 tick(300);expect(document.querySelector('[data-abort-riichi-seat="3"]')).not.toBeNull();
 unmount();expect(vi.getTimerCount()).toBe(0);
});
it("reconnecting mid-cause and receiving an old snapshot never rewinds the CSS fade",()=>{
 const {room}=setup('ron');room.game!.settlementFlow!.elapsedMs=3450;
 const {rerender}=render(<MahjongSettlementPanel game={room.game!} room={room} connected busy={false} onChoice={()=>{}}/>);
 const reason=screen.getByRole('region',{name:'流局原因'});
 expect(reason.style.getPropertyValue('--abort-cause-age')).toBe('-450ms');
 const old={...room.game!,settlementFlow:{...room.game!.settlementFlow!,elapsedMs:3000}};
 rerender(<MahjongSettlementPanel game={old} room={room} connected busy={false} onChoice={()=>{}}/>);
 expect(reason.style.getPropertyValue('--abort-cause-age')).toBe('-450ms');
});
it("reconnected published hands skip completed flip animations instead of replaying",()=>{
 const {room}=setup('riichi');room.game!.settlementFlow!.elapsedMs=1900;
 const {rerender}=mount(room);
 const rack=document.querySelector<HTMLElement>('[data-draw-reveal-seat="1"]')!;
 expect(rack.style.getPropertyValue('--draw-flip-age')).toBe('-300ms');
 room.game={...room.game!,settlementFlow:{...room.game!.settlementFlow!,elapsedMs:1000}};
 rerender(<GameRoom room={room} host={false} busy={false} ownSeat={0} connected motionCanAnimate={false} onChoice={()=>{}} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/>);
 expect(rack.style.getPropertyValue('--draw-flip-age')).toBe('-300ms');
});
