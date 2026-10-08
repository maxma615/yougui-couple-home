// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MahjongSettlementPanel } from "@/components/mahjong/mahjong-settlement-panel";
import type { RoomView } from "@/modules/mahjong/types";

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
function result(stage: "detail" | "scores", count: 3 | 4 = 3): RoomView {
  const oldScores = Array(count).fill(count === 3 ? 35000 : 25000);
  const delta = count === 3 ? [-5200, 2600, 2600] : [-5200, 2600, 2600, 0];
  return { id: "sequence", code: "ABCDEFGH", hostUserId: "0", variant: count === 3 ? "sanma" : "yonma", mode: "east", status: "playing", version: 1, mySeat: 0,
    members: Array.from({length: count}, (_,seat) => ({ userId: String(seat), displayName: ["甲","乙","丙","丁"][seat], seat, kind: "human", ready: true, connected: true })),
    game: { gameInstanceId: "native-game", handId: 1, decisionId: `flow:${stage}`, phase: stage === "scores" ? "score_change" : "hule", roundWind: 0, roundNumber: 1, honba: 0, riichiSticks: 0, remainingTiles: 20, doraIndicators: ["z6"], turnSeat: 0, hand: [], drawnTile: null, choices: [{id: "ack", type: "ack"}], ranking: null,
      players: oldScores.map((score,seat) => ({seat,wind:seat,score,handCount:13,discards:[],melds:[],riichi:false})),
      settlement: {kind:"win",name:"和了",winnerSeat:1,winMethod:"ron",winningTile:"z2",hand:"p123456789s123z22",fu:40,han:2,points:2600,delta:[-2600,2600,0,...(count===4?[0]:[])],yaku:[{name:"混全带幺九",han:2},{name:"门前清自摸和",han:1}],uraIndicators:["p1"]},
      settlementFlow: {id:"result-1",stage,detailIndex:stage==="scores"?2:0,detailCount:2,elapsedMs:0,oldScores,delta,newScores:oldScores.map((score,seat)=>score+delta[seat])} } };
}
function show(room = result("scores")) {
  const onChoice = vi.fn();
  const props = {game:room.game!,room,connected:true,busy:false,onChoice};
  const rendered = render(<MahjongSettlementPanel {...props}/>);
  return { ...rendered, props, onChoice, rerenderProps: (overrides: Partial<typeof props>) => rendered.rerender(<MahjongSettlementPanel {...props} {...overrides}/>) };
}
function declaredResult(count:3|4=3){
 const r=result('detail',count);r.game!.settlementFlow!.winDeclarations=[{seat:1,winMethod:'ron'},{seat:2,winMethod:'ron'}];return r;
}
it.each([3,4] as const)('delays first declared winner manual confirmation to2460ms at %i seats',count=>{
 const {onChoice}=show(declaredResult(count));expect(screen.queryByRole('region',{name:'和牌详情'})).toBeNull();
 tick(1199);expect(screen.queryByRole('button',{name:/继续/})).toBeNull();tick(1);
 const button=screen.getByRole('button',{name:/继续/}) as HTMLButtonElement;expect(button.disabled).toBe(true);
 fireEvent.click(button);expect(onChoice).not.toHaveBeenCalled();tick(1259);expect(button.disabled).toBe(true);
 tick(1);expect(button.disabled).toBe(false);fireEvent.click(button);fireEvent.click(button);expect(onChoice).toHaveBeenCalledExactlyOnceWith({id:'ack',type:'ack'});
 tick(10000);expect(onChoice).toHaveBeenCalledTimes(1);
});
it.each([3,4] as const)('auto confirms first declared winner at5460ms once despite same-page updates at %i seats',count=>{
 const {onChoice,props,rerenderProps}=show(declaredResult(count));tick(1000);
 const refreshed=structuredClone(props.game);refreshed.settlementFlow!.elapsedMs=1000;rerenderProps({game:refreshed});
 tick(4459);expect(onChoice).not.toHaveBeenCalled();tick(1);expect(onChoice).toHaveBeenCalledExactlyOnceWith({id:'ack',type:'ack'});
 const repeated=structuredClone(refreshed);repeated.settlementFlow!.elapsedMs=5460;rerenderProps({game:repeated});tick(10000);expect(onChoice).toHaveBeenCalledTimes(1);
});
it('uses1260/4260ms for the second declared winner and cancels the first page clock',()=>{
 const {onChoice,props,rerenderProps}=show(declaredResult());tick(1000);
 const next=structuredClone(props.game);next.decisionId='result:detail:1';next.settlementFlow!.detailIndex=1;next.settlement!.winnerSeat=2;next.choices=[{id:'ack-second',type:'ack'}];
 rerenderProps({game:next});const button=screen.getByRole('button',{name:/继续/}) as HTMLButtonElement;
 tick(1259);expect(button.disabled).toBe(true);tick(1);expect(button.disabled).toBe(false);
 tick(2999);expect(onChoice).not.toHaveBeenCalled();tick(1);expect(onChoice).toHaveBeenCalledExactlyOnceWith({id:'ack-second',type:'ack'});
 tick(10000);expect(onChoice).toHaveBeenCalledTimes(1);
});
it('does not send an old declared-page ACK across disconnect and a new detail page',()=>{
 const {onChoice,props,rerenderProps}=show(declaredResult());tick(3500);rerenderProps({connected:false});tick(2500);expect(onChoice).not.toHaveBeenCalled();
 const next=structuredClone(props.game);next.decisionId='result:detail:1';next.settlementFlow!.detailIndex=1;next.settlement!.winnerSeat=2;next.choices=[{id:'ack-second',type:'ack'}];
 rerenderProps({game:next,connected:false});tick(1000);expect(onChoice).not.toHaveBeenCalled();
 rerenderProps({game:next,connected:true});tick(3259);expect(onChoice).not.toHaveBeenCalled();tick(1);
 expect(onChoice).toHaveBeenCalledExactlyOnceWith({id:'ack-second',type:'ack'});
});
it('unmount cancels the first declared winner auto ACK',()=>{
 const {onChoice,unmount}=show(declaredResult());tick(5459);expect(onChoice).not.toHaveBeenCalled();unmount();tick(10000);expect(onChoice).not.toHaveBeenCalled();
});
it.each([3,4] as const)("separates winner detail from aggregate transfers at %i seats", count => {
  const r = result("detail",count), {rerenderProps} = show(r);
  const detail = screen.getByRole("region",{name:"和牌详情"});
  expect(within(detail).queryByLabelText("本次各席收支")).toBeNull();
  expect(detail.textContent).toContain("第 1 / 共 2 位");
  expect(within(detail).getByText("2,600 点")).toBeTruthy();
  expect(detail.querySelector('.mahjong-winning-hand')).toBeTruthy();
  const scoreRoom = result("scores",count); rerenderProps({game:scoreRoom.game!,room:scoreRoom});
  const scores = screen.getByRole("region",{name:"本局收支"});
  expect(scores.querySelector('.mahjong-winning-hand')).toBeNull();
  expect(scores.querySelector('ul')).toBeNull();
  expect(scores.querySelectorAll('[data-settlement-seat]')).toHaveLength(count);
});
it("reveals detail before enabling manual confirmation, then confirms only once", () => {
  const {onChoice} = show(result("detail"));
  const button = screen.getByRole("button",{name:/继续/}) as HTMLButtonElement;
  fireEvent.click(button); expect(onChoice).not.toHaveBeenCalled();
  tick(1259); expect(button.disabled).toBe(true);
  tick(1); expect(button.disabled).toBe(false);
  tick(2999); expect(onChoice).not.toHaveBeenCalled();
  tick(1); expect(onChoice).toHaveBeenCalledExactlyOnceWith({id:"ack",type:"ack"});
  tick(10000); expect(onChoice).toHaveBeenCalledTimes(1);
});
it("rolls real net scores in 33 steps without enabling the score ACK early", () => {
  const {onChoice} = show();
  const score = screen.getByTestId("settlement-score-0");
  const button = screen.getByRole("button",{name:/继续/}) as HTMLButtonElement;
  expect(score.textContent).toBe("35,000"); tick(1199); expect(score.textContent).toBe("35,000");
  tick(1); expect(score.textContent).toBe("34,843");
  tick(30); expect(score.textContent).toBe("34,685");
  tick(930); expect(score.textContent).toBe("29,800");
  tick(2339); expect(button.disabled).toBe(true);
  tick(1); expect(button.disabled).toBe(false);
  tick(2999); expect(onChoice).not.toHaveBeenCalled();
  tick(1); expect(onChoice).toHaveBeenCalledTimes(1);
});
it("changes phase without carrying an old timer into the score page", () => {
  const {onChoice,rerenderProps} = show(result("detail")); tick(4000);
  const r = result("scores"); rerenderProps({room:r,game:r.game!});
  tick(3500); expect(onChoice).not.toHaveBeenCalled();
  tick(4000); expect(onChoice).toHaveBeenCalledTimes(1);
});
it("cancels automatic ACK after unmount", () => {const {onChoice,unmount}=show();tick(7400);unmount();tick(10000);expect(onChoice).not.toHaveBeenCalled();});
it.each(["connected","busy"] as const)("holds automatic ACK while %s blocks it, then acknowledges the current page once", guard => {
  const {onChoice,rerenderProps}=show(); tick(1000);
  rerenderProps(guard==="connected"?{connected:false}:{busy:true}); tick(8000);
  expect(onChoice).not.toHaveBeenCalled();
  rerenderProps(guard==="connected"?{connected:true}:{busy:false});
  expect(onChoice).toHaveBeenCalledTimes(1);tick(10000);expect(onChoice).toHaveBeenCalledTimes(1);
});
it("permits a manual retry after a failed request releases busy, without automatic retries", () => {
  const {onChoice,rerenderProps}=show();tick(7500);expect(onChoice).toHaveBeenCalledTimes(1);
  rerenderProps({busy:true});rerenderProps({busy:false});
  const button=screen.getByRole("button",{name:/继续/}) as HTMLButtonElement;
  expect(button.disabled).toBe(false);fireEvent.click(button);fireEvent.click(button);
  expect(onChoice).toHaveBeenCalledTimes(2);tick(10000);expect(onChoice).toHaveBeenCalledTimes(2);
});
it("does not acknowledge an already confirmed seat",()=>{const r=result("scores");r.game!.choices=[];const {onChoice}=show(r);tick(20000);expect(onChoice).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:/继续/})).toBeNull();});
it("uses relative elapsed time despite device wall-clock jumps",()=>{const {onChoice}=show();vi.setSystemTime(Date.now()+86400000);tick(4499);expect((screen.getByRole("button",{name:/继续/}) as HTMLButtonElement).disabled).toBe(true);expect(onChoice).not.toHaveBeenCalled();tick(1);expect((screen.getByRole("button",{name:/继续/}) as HTMLButtonElement).disabled).toBe(false);});
it("shows final numbers under reduced motion while preserving the confirmation delay",()=>{vi.stubGlobal("matchMedia",()=>({matches:true,addEventListener(){},removeEventListener(){}}));show();expect(screen.getByTestId("settlement-score-0").textContent).toBe("29,800");expect((screen.getByRole("button",{name:/继续/}) as HTMLButtonElement).disabled).toBe(true);tick(4500);expect((screen.getByRole("button",{name:/继续/}) as HTMLButtonElement).disabled).toBe(false);});
it("does not send leftover result ACKs after terminal ranking appears",()=>{const {onChoice,rerenderProps,props}=show();tick(7000);const g=structuredClone(props.game);g.ranking=[{seat:0,rank:1,score:40000}];rerenderProps({game:g});tick(10000);expect(onChoice).not.toHaveBeenCalled();expect(screen.queryByRole('region')).toBeNull();});
it("finishes a zero-transfer score page at 1200ms and auto confirms at 4200ms",()=>{const r=result("scores");r.game!.settlementFlow!.delta=[0,0,0];r.game!.settlementFlow!.newScores=[35000,35000,35000];const {onChoice}=show(r);tick(1199);expect((screen.getByRole('button',{name:/继续/}) as HTMLButtonElement).disabled).toBe(true);tick(1);expect((screen.getByRole('button',{name:/继续/}) as HTMLButtonElement).disabled).toBe(false);tick(3000);expect(onChoice).toHaveBeenCalledTimes(1);});

it("shows waiting for other players after the viewer confirms their final score page",()=>{const r=result("scores");r.game!.choices=[];show(r);expect(screen.getByText("等待其他玩家")).toBeTruthy();expect(screen.queryByRole("button",{name:/继续/})).toBeNull();});
it("starts a new winner at the top while preserving scroll on same-page updates",()=>{
 const r=result("detail"),{props,rerenderProps}=show(r);
 const body=document.querySelector<HTMLElement>('.mahjong-settlement-panel__content')!;body.scrollTop=80;
 const update=structuredClone(props.game);update.settlementFlow!.elapsedMs=500;
 rerenderProps({game:update});expect(document.querySelector<HTMLElement>('.mahjong-settlement-panel__content')!.scrollTop).toBe(80);
 const next=structuredClone(update);next.decisionId="flow:detail:1";next.settlementFlow!.detailIndex=1;next.settlementFlow!.elapsedMs=0;next.settlement!.winnerSeat=2;
 rerenderProps({game:next});expect(document.querySelector<HTMLElement>('.mahjong-settlement-panel__content')!.scrollTop).toBe(0);
});

it.each([3,4] as const)("shows five-slot public and private indicator rows for each winner at %i seats",count=>{
 const r=result("detail",count);r.game!.doraIndicators=["z6","p0","s9"];
 const {props,rerenderProps}=show(r);
 const detail=screen.getByRole("region",{name:"和牌详情"});
 const dora=within(detail).getByRole("group",{name:"宝牌指示牌"});
 expect([...dora.querySelectorAll('[data-tile-face]')].map(el=>el.getAttribute('data-tile-face'))).toEqual(["z6","p0","s9"]);
 expect(dora.querySelectorAll('.mahjong-indicator-back')).toHaveLength(2);
 const ura=within(detail).getByRole("group",{name:"里宝牌指示牌"});
 expect([...ura.querySelectorAll('[data-tile-face]')].map(el=>el.getAttribute('data-tile-face'))).toEqual(["p1"]);
 expect(ura.querySelectorAll('.mahjong-indicator-back')).toHaveLength(4);
 const next=structuredClone(props.game);next.decisionId="result:next";next.settlementFlow!.detailIndex=1;next.settlement!.winnerSeat=2;next.settlement!.uraIndicators=[];
 rerenderProps({game:next});
 const concealed=screen.getByRole("group",{name:"里宝牌指示牌"});
 expect(concealed.querySelectorAll('[data-tile-face]')).toHaveLength(0);
 expect(concealed.querySelectorAll('.mahjong-indicator-back')).toHaveLength(5);
 rerenderProps({game:result("scores",count).game!});
 expect(screen.queryByRole("group",{name:"宝牌指示牌"})).toBeNull();
 expect(screen.queryByRole("group",{name:"里宝牌指示牌"})).toBeNull();
});
