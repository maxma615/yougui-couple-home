// @vitest-environment jsdom
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, renderHook, screen, within} from "@testing-library/react";
import {MahjongSettlementPanel} from "@/components/mahjong/mahjong-settlement-panel";
import {GameRoom} from "@/components/mahjong/mahjong-client";
import {SettlementSequenceGame} from "@/modules/mahjong/settlement-sequence";
import type {GameVariant, RoomView} from "@/modules/mahjong/types";
import {drawEngine, playToDraw} from "../fixtures/mahjong-draw-game";
import {physicalEngine} from "../fixtures/mahjong-settlement-game";
import {useDrawResultLead} from "@/components/mahjong/use-draw-result-lead";

beforeEach(() => vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]}));
afterEach(() => {cleanup();vi.useRealTimers();});
const tick = (ms:number) => act(() => vi.advanceTimersByTime(ms));
function setup(variant:GameVariant, kind:"exhaustive"|"abort"|"nagashi", ownSeat=0, hiddenNagashi=false) {
  const count=variant==="sanma"?3:4;
  const raw=kind==="abort" ? physicalEngine(variant,{0:"m19p19s19z1234567"},"z1") : drawEngine(variant,kind==="nagashi"?[0,1]:[], {hands:hiddenNagashi ? ["p223468s2234067","p556677s3344556","p234678s2256678","m2233445566778"] : undefined});
  const game=new SettlementSequenceGame(raw,count);
  if(kind==="abort") {const view=game.view(0);game.respond(0,view.decisionId,view.choices.find(c=>c.type==="abort")!.id);}
  else playToDraw(game,count);
  const room:RoomView={id:"draw-table",code:"ABCDEFGH",hostUserId:"0",variant,mode:"east",status:"playing",version:1,mySeat:ownSeat,
    members:Array.from({length:count},(_,seat)=>({userId:String(seat),displayName:`玩家${seat}`,seat,kind:"human",ready:true,connected:true})),game:game.view(ownSeat)};
  const onChoice=vi.fn();
  const props={game:room.game!,room,connected:true,busy:false,onChoice};
  return {game,room,props,onChoice};
}
it.each(["sanma","yonma"] as const)("%s reveals tenpai summary and unique waits before transfers",variant=>{
  const {props,onChoice}=setup(variant,"exhaustive");render(<MahjongSettlementPanel {...props}/>);
  expect(screen.queryByRole("region")).toBeNull();tick(2000);
  const summary=screen.getByRole("region",{name:"听牌结果"});
  expect(within(summary).queryByLabelText("本次各席收支")).toBeNull();
  const heard=summary.querySelector('[data-draw-seat="0"]')!;
  expect(heard.textContent).toContain("听牌");
  expect(heard.querySelectorAll('[aria-label="公开手牌"] [data-tile-face]')).toHaveLength(13);
  expect([...heard.querySelectorAll('[aria-label="待牌"] [data-tile-face]')].map(t=>t.getAttribute('data-tile-face'))).toEqual(["z2"]);
  expect(summary.querySelector('[data-draw-seat="1"]')!.textContent).toContain("未听牌");
  expect(summary.querySelector('[data-draw-seat="1"] [data-tile-face]')).toBeNull();
  const button=within(summary).getByRole("button",{name:/继续/}) as HTMLButtonElement;
  tick(999);expect(button.disabled).toBe(true);tick(1);expect(button.disabled).toBe(false);
  tick(2999);expect(onChoice).not.toHaveBeenCalled();tick(1);expect(onChoice).toHaveBeenCalledTimes(1);
});
it.each(["sanma","yonma"] as const)("%s shows abort cause without tenpai or transfer labels",variant=>{
  const {props,onChoice}=setup(variant,"abort");render(<MahjongSettlementPanel {...props}/>);
  tick(1000);const reason=screen.getByRole("region",{name:"流局原因"});
  expect(reason.textContent).toContain("九種九牌");expect(reason.textContent).not.toMatch(/听牌|结算前|支付|获得/);
  tick(999);expect((within(reason).getByRole('button',{name:/继续/}) as HTMLButtonElement).disabled).toBe(true);
  tick(3001);expect(onChoice).toHaveBeenCalledTimes(1);
});
it("shows native nagashi detail without fabricated winning tile, han or fu",()=>{
  const {props,game}=setup("yonma","nagashi",0,true);
  expect(props.game.settlement?.drawInfo?.revealedHands.some(h=>h.seat===0)).toBe(false);
  game.respond(0,props.game.decisionId,"ack");
  props.game=game.view(0);render(<MahjongSettlementPanel {...props}/>);
  const detail=screen.getByRole('region',{name:'流满贯详情'});
  expect(detail.textContent).toContain('玩家0');expect(detail.textContent).toContain('满贯');
  expect(detail.textContent).toContain('12,000 点');expect(detail.textContent).not.toMatch(/0 翻|0 符/);
  expect(detail.querySelector('[data-testid="mahjong-winning-tile"]')).toBeNull();
  expect(detail.querySelector('.mahjong-winning-hand')).toBeNull();
  const yaku=within(detail).getByTestId('nagashi-yaku'),title=within(detail).getByTestId('nagashi-mangan-title');
  tick(599);expect(yaku.classList.contains('is-pending')).toBe(true);
  tick(1);expect(yaku.classList.contains('is-revealed')).toBe(true);
  const value=detail.querySelector('.mahjong-settlement-panel__value')!;
  tick(1199);expect(value.classList.contains('is-pending')).toBe(true);
  tick(1);expect(value.classList.contains('is-revealed')).toBe(true);
  tick(699);expect(title.classList.contains('is-pending')).toBe(true);
  tick(1);expect(title.classList.contains('is-revealed')).toBe(true);
  const button=within(detail).getByRole('button',{name:/继续/}) as HTMLButtonElement;
  tick(299);expect(button.disabled).toBe(true);tick(1);expect(button.disabled).toBe(false);
});
it("retains a genuinely public nagashi winner hand in the detail",()=>{
  const {props,game}=setup("yonma","nagashi");
  expect(props.game.settlement?.drawInfo?.revealedHands.some(h=>h.seat===0)).toBe(true);
  game.respond(0,props.game.decisionId,"ack");props.game=game.view(0);
  render(<MahjongSettlementPanel {...props}/>);
  expect(screen.getByRole('region',{name:'流满贯详情'}).querySelectorAll('.mahjong-winning-hand [data-tile-face]')).toHaveLength(13);
});
it("cancels draw auto-confirm while disconnected and sends the current ACK once on return",()=>{
  const {props,onChoice}=setup('sanma','exhaustive');const {rerender}=render(<MahjongSettlementPanel {...props}/>);
  tick(2000);rerender(<MahjongSettlementPanel {...props} connected={false}/>);tick(10000);
  expect(onChoice).not.toHaveBeenCalled();rerender(<MahjongSettlementPanel {...props}/>);
  expect(onChoice).toHaveBeenCalledTimes(1);tick(10000);expect(onChoice).toHaveBeenCalledTimes(1);
});
it("reveals only the authorized opponent rack before opening the draw summary",()=>{
  const {room,onChoice}=setup('yonma','exhaustive',1);
  render(<GameRoom room={room} host={false} busy={false} ownSeat={1} connected motionCanAnimate={false} onChoice={onChoice} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/>);
  expect(document.querySelector('[data-draw-reveal-seat="0"]')).toBeNull();tick(1000);
  const publicRack=document.querySelector('[data-draw-reveal-seat="0"]')!;expect(publicRack).not.toBeNull();
  expect(publicRack.querySelectorAll('[data-tile-face]')).toHaveLength(13);
  expect(document.querySelector('[data-draw-reveal-seat="2"]')).toBeNull();
  expect(screen.queryByRole('region',{name:'听牌结果'})).toBeNull();tick(1000);
  expect(screen.getByRole('region',{name:'听牌结果'})).toBeTruthy();
  expect(publicRack.querySelectorAll('[data-flight-volume]')).toHaveLength(13);
});
it("delays summary and confirmation by the remaining physical discard animation",()=>{
  const {props,onChoice}=setup('sanma','exhaustive');
  render(<MahjongSettlementPanel {...props} {...{leadInMs:230}}/>);
  tick(2000);expect(screen.queryByRole('region',{name:'听牌结果'})).toBeNull();
  tick(230);const region=screen.getByRole('region',{name:'听牌结果'});
  const button=within(region).getByRole('button',{name:/继续/}) as HTMLButtonElement;
  tick(999);expect(button.disabled).toBe(true);tick(1);expect(button.disabled).toBe(false);
  tick(3000);expect(onChoice).toHaveBeenCalledTimes(1);
});
it("measures the remaining running discard before revealing a public rack",()=>{
  const flight=document.createElement('div');flight.className='mahjong-discard-flight';
  Object.defineProperty(flight,'getAnimations',{value:()=>[{playState:'running',currentTime:110,effect:{getComputedTiming:()=>({endTime:230})}}]});
  document.body.append(flight);
  try {
    const {room,onChoice}=setup('yonma','exhaustive',1);
    render(<GameRoom room={room} host={false} busy={false} ownSeat={1} connected motionCanAnimate={false} onChoice={onChoice} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/>);
    tick(1000);expect(document.querySelector('[data-draw-reveal-seat="0"]')).toBeNull();
    tick(120);expect(document.querySelector('[data-draw-reveal-seat="0"]')).not.toBeNull();
    tick(880);expect(screen.queryByRole('region',{name:'听牌结果'})).toBeNull();
    tick(120);expect(screen.getByRole('region',{name:'听牌结果'})).toBeTruthy();
  } finally {flight.remove();}
});
it("waits for the final discard when it replaces an overlapping prior flight",()=>{
  const flight=document.createElement('div');flight.className='mahjong-discard-flight';
  let currentTime=130;
  Object.defineProperty(flight,'getAnimations',{value:()=>[{playState:'running',currentTime,effect:{getComputedTiming:()=>({endTime:230})}}]});
  document.body.append(flight);
  try {
    const {props}=setup('yonma','exhaustive');
    const {result,rerender}=renderHook(({version})=>useDrawResultLead(props.game,version),{initialProps:{version:1}});
    expect(result.current).toBe(100);
    tick(20);currentTime=0;rerender({version:2});
    expect(result.current).toBe(250);
    // Completing the flight cannot bring the already established deadline forward.
    tick(100);currentTime=230;rerender({version:3});
    expect(result.current).toBe(250);
  } finally {flight.remove();}
});
