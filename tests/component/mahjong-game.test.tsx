// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GameRoom } from "@/components/mahjong/mahjong-client";
import { SanmaGame } from "@/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "@/modules/mahjong/sanma-wall";
import { northReplacementFixture as fixtureGame } from "../fixtures/mahjong-view-game";
import type { GameView, RoomView } from "@/modules/mahjong/types";

const screenDescriptors = [
  [document.documentElement, "requestFullscreen"], [document, "exitFullscreen"],
  [document, "fullscreenElement"], [window.screen, "orientation"],
  [HTMLDialogElement.prototype, "showModal"],
].map(([target, key]) => ({ target: target as object, key: key as string, descriptor: Object.getOwnPropertyDescriptor(target as object, key as string) }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const {target, key, descriptor} of screenDescriptors) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
});

it("requests fullscreen before landscape lock and releases only the screen it acquired", async () => {
  const calls: string[] = [];
  const requestFullscreen = vi.fn(async () => { calls.push("fullscreen"); });
  const exitFullscreen = vi.fn(async () => {});
  const lock = vi.fn(async () => { calls.push("landscape"); });
  const unlock = vi.fn();
  Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: requestFullscreen });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => requestFullscreen.mock.calls.length ? document.documentElement : null });
  Object.defineProperty(window.screen, "orientation", { configurable: true, value: { lock, unlock } });
  show(fixtureGame().view(0));
  fireEvent.click(screen.getByRole("button", { name: "全屏横屏" }));
  await waitFor(() => expect(lock).toHaveBeenCalledWith("landscape"));
  expect(calls).toEqual(["fullscreen", "landscape"]);
  cleanup();
  expect(unlock).toHaveBeenCalledOnce();
  expect(exitFullscreen).toHaveBeenCalledOnce();
  delete (document.documentElement as Partial<HTMLElement>).requestFullscreen;
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
});

it("keeps a useful rotation hint when fullscreen is unavailable, without sending a game command", async () => {
  const onChoice = show(fixtureGame().view(0));
  fireEvent.click(screen.getByRole("button", { name: "全屏横屏" }));
  await waitFor(() => expect(screen.getByRole("status", { name: "屏幕方向提示" }).textContent).toContain("旋转手机"));
  expect(onChoice).not.toHaveBeenCalled();
});

it("does not close an existing fullscreen session owned by another element", async () => {
  const exit = vi.fn(async () => {}), lock = vi.fn(async () => {}), unlock = vi.fn();
  Object.defineProperty(document, "fullscreenElement", {configurable: true, value: document.body});
  Object.defineProperty(document, "exitFullscreen", {configurable: true, value: exit});
  Object.defineProperty(window.screen, "orientation", {configurable: true, value: {lock, unlock}});
  show(fixtureGame().view(0)); fireEvent.click(screen.getByRole("button", {name: "全屏横屏"}));
  await waitFor(() => expect(lock).toHaveBeenCalledWith("landscape"));
  cleanup(); expect(exit).not.toHaveBeenCalled(); expect(unlock).toHaveBeenCalledOnce();
});

it("leaving the table during a pending fullscreen request prevents a late orientation lock", async () => {
  let resolve!: () => void, entered = false;
  const request = vi.fn(() => new Promise<void>(done => { resolve = () => { entered = true; done(); }; }));
  const exit = vi.fn(async () => {}), lock = vi.fn();
  Object.defineProperty(document.documentElement, "requestFullscreen", {configurable: true, value: request});
  Object.defineProperty(document, "fullscreenElement", {configurable: true, get: () => entered ? document.documentElement : null});
  Object.defineProperty(document, "exitFullscreen", {configurable: true, value: exit});
  Object.defineProperty(window.screen, "orientation", {configurable: true, value: {lock}});
  show(fixtureGame().view(0)); fireEvent.click(screen.getByRole("button", {name: "全屏横屏"}));
  cleanup(); resolve();
  await waitFor(() => expect(exit).toHaveBeenCalledOnce());
  expect(lock).not.toHaveBeenCalled();
});
function room(game: GameView, status: RoomView["status"] = "playing"): RoomView {
  return { id: "fixture", code: "ABCDEFGH", hostUserId: "human", mode: "east", variant: "sanma", status, version: 1, mySeat: 0, members: [0, 1, 2].map(seat => ({ userId: seat ? `bot:${seat}` : "human", kind: seat ? "bot" : "human", displayName: `玩家${seat}`, seat, ready: true, connected: true })), game };
}
function show(view: GameView, status?: RoomView["status"]) {
  const onChoice = vi.fn();
  render(<GameRoom room={room(view, status)} busy={false} host ownSeat={0} connected onChoice={onChoice} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);
  return onChoice;
}
it("shows only the legal North action, forwards its actual choice and renders public counts", () => {
  const game = fixtureGame(), before = game.view(0), onChoice = show(before);
  expect(document.querySelectorAll(".mahjong-player")).toHaveLength(3);
  const choice = before.choices.find(c => c.type === "nuki")!;
  fireEvent.click(screen.getByRole("button", { name: "拔北" }));
  expect(onChoice).toHaveBeenCalledWith(choice);
  cleanup(); game.respond(0, before.decisionId, choice.id);
  const after = game.view(0); show(after);
  expect(screen.getByTestId("nuki-0").textContent).toBe("北 × 1");
  expect(screen.getByTestId("nuki-tiles-0").querySelectorAll('[data-tile-face="z4"]')).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "拔北" })).toBeNull();
});
it("renders actual three-seat settlement deltas and final ranks from a complete legal game", () => {
  const game = new SanmaGame("east", ["A", "B", "C"], { dealer: 0, wallFactory: () => new SanmaWall(sanmaTiles()) });
  let settlement: GameView | undefined;
  for (let move = 0; move < 6000 && !game.view(0).ranking; move++) {
    if (game.view(0).settlement) settlement = game.view(0);
    for (let seat = 0; seat < 3; seat++) {
      const view = game.view(seat), choice = view.choices.find(c => c.type === "pass") ?? view.choices.find(c => c.type === "discard") ?? view.choices.find(c => c.type === "ack");
      if (choice) game.respond(seat, view.decisionId, choice.id);
    }
  }
  expect(settlement).toBeDefined(); show(settlement!);
  expect(document.querySelectorAll(".mahjong-settlement-panel__delta > span")).toHaveLength(3);
  expect(document.querySelectorAll(".mahjong-player__head > b")).toHaveLength(3);
  cleanup(); const finished = game.view(0); expect(finished.ranking).toHaveLength(3); show(finished, "finished");
  expect(document.querySelectorAll(".mahjong-ranking__row")).toHaveLength(3);
  expect(screen.getByLabelText("最终名次").textContent).toContain("玩家2");
});

it("opens readable public meld details without making a game decision or revealing closed kan faces", () => {
  const view = fixtureGame().view(0);
  view.players[1].melds = ["p111+", "s4444"];
  const onChoice = show(view);
  fireEvent.click(screen.getByRole("button", {name:"查看玩家1的公开副露"}));
  const dialog = document.querySelector(".mahjong-public-melds")!;
  expect(dialog.getAttribute("aria-label")).toBe("玩家1的公开副露");
  expect(dialog.querySelectorAll('[data-tile-face="p1"]')).toHaveLength(3);
  expect(dialog.querySelectorAll('.mahjong-meld__back')).toHaveLength(4);
  expect(dialog.querySelectorAll('[data-tile-face="s4"]')).toHaveLength(0);
  expect(onChoice).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name:"关闭副露详情", hidden:true}));
  expect(document.querySelector(".mahjong-public-melds")).toBeNull();
});

it("renders no action popup while waiting for another player's decision", () => {
  const view = fixtureGame().view(0);
  view.choices = []; view.turnSeat = 1; view.drawnTile = null;
  const onChoice = show(view);
  for (const name of ["自摸", "立直", "拔北", "荣和", "碰", "杠", "吃", "过"]) {
    expect(screen.queryByRole("button", {name})).toBeNull();
  }
  expect(screen.queryByLabelText("可执行操作")).toBeNull();
  expect(onChoice).not.toHaveBeenCalled();
});

it("keeps each extracted North visible through later decisions and resets only from new game state", () => {
  const game = fixtureGame(true);
  for (let count = 1; count <= 2; count++) {
    const before = game.view(0), nuki = before.choices.find(choice => choice.type === "nuki")!;
    expect(nuki).toBeDefined(); game.respond(0, before.decisionId, nuki.id);
    cleanup(); show(game.view(0));
    expect(screen.getByTestId("nuki-tiles-0").querySelectorAll('[data-tile-face="z4"]')).toHaveLength(count);
  }
  const last = game.view(0); last.choices = []; last.turnSeat = 1;
  cleanup(); show(last);
  expect(screen.getByTestId("nuki-tiles-0").querySelectorAll('[data-tile-face="z4"]')).toHaveLength(2);
  cleanup(); show(fixtureGame().view(0));
  expect(screen.queryByTestId("nuki-tiles-0")).toBeNull();
});

it("shows only the offered response actions and sends the original option, including its meld", () => {
  const view = fixtureGame().view(0);
  const pon = {id:"pon:p111+",type:"pon" as const,value:"p111+"};
  view.choices = [pon,{id:"pass",type:"pass"}]; view.turnSeat = 1;
  const onChoice = show(view);
  expect(screen.queryByRole("button", {name:"自摸"})).toBeNull();
  expect(screen.queryByRole("button", {name:"立直"})).toBeNull();
  expect(screen.getAllByRole("button", {name:/^碰/})).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", {name:/^碰/}));
  expect(onChoice).toHaveBeenCalledWith(pon);
  fireEvent.click(screen.getByRole("button", {name:"过"}));
  expect(onChoice).toHaveBeenLastCalledWith(view.choices[1]);
});

it("forwards the actual legal tsumo choice after a closed North replacement win", () => {
  const game = fixtureGame(), initial = game.view(0);
  game.respond(0, initial.decisionId, initial.choices.find(c=>c.type === "nuki")!.id);
  const winning = game.view(0), tsumo = winning.choices.find(c=>c.type === "tsumo");
  expect(tsumo).toBeDefined();
  const onChoice = show(winning);
  fireEvent.click(screen.getByRole("button", {name:"自摸"}));
  expect(onChoice).toHaveBeenCalledWith(tsumo);
});

it("announces confirmed North extraction once while the visible tile survives the feedback timeout", () => {
  vi.useFakeTimers();
  const game = fixtureGame();
  const props = {busy:false,host:true,ownSeat:0,connected:true,onChoice:vi.fn(),onFinish:vi.fn(),onRematch:vi.fn(),onLeave:vi.fn()};
  const initial = game.view(0);
  const {rerender} = render(<GameRoom room={room(initial)} {...props}/>);
  expect(screen.queryByRole("status", {name:"牌桌动作"})).toBeNull();
  const nuki = initial.choices.find(c=>c.type === "nuki")!;
  game.respond(0, initial.decisionId, nuki.id);
  const next = room(game.view(0));
  rerender(<GameRoom room={next} {...props}/>);
  expect(screen.getByRole("status", {name:"牌桌动作"}).textContent).toContain("拔北");
  act(() => {vi.advanceTimersByTime(1200);});
  expect(screen.queryByRole("status", {name:"牌桌动作"})).toBeNull();
  expect(screen.getByTestId("nuki-tiles-0").querySelectorAll('[data-tile-face="z4"]')).toHaveLength(1);
  rerender(<GameRoom room={{...next,game:game.view(0)}} {...props}/>);
  expect(screen.queryByRole("status", {name:"牌桌动作"})).toBeNull();
});

it("opens riichi tile selection only with a legal option and sends the selected server choice", () => {
  const game=fixtureGame(), before=game.view(0);
  const legal=before.choices.find(c=>c.type==="riichi" && c.value==="z4_");
  expect(legal).toBeDefined();
  const onChoice=show(before);
  fireEvent.click(screen.getByRole("button",{name:"立直"}));
  expect(onChoice).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"立直后切出 北风"}));
  expect(onChoice).toHaveBeenCalledWith(legal);
});

it("groups alternative calls into one contextual action and waits for an explicit meld selection", () => {
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  const view=fixtureGame().view(0);
  const first={id:"chi:p123-",type:"chi" as const,value:"p123-"};
  const second={id:"chi:p234-",type:"chi" as const,value:"p234-"};
  view.choices=[first,second,{id:"pass",type:"pass"}];
  const onChoice=show(view);
  expect(screen.getAllByRole("button",{name:/^吃/})).toHaveLength(1);
  fireEvent.click(screen.getByRole("button",{name:"吃"}));
  expect(onChoice).not.toHaveBeenCalled();
  const dialog=screen.getByRole("dialog",{name:"选择吃牌",hidden:true});
  const options=dialog.querySelectorAll<HTMLButtonElement>('[data-choice-id]');
  expect(options).toHaveLength(2);
  fireEvent.click(options[1]);
  expect(onChoice).toHaveBeenCalledWith(second);
});

it("closes a pending meld picker when the server advances the decision", () => {
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  const view=fixtureGame().view(0), onChoice=vi.fn();
  view.choices=[{id:"kan:p1111",type:"kan",value:"p1111"},{id:"kan:s2222",type:"kan",value:"s2222"}];
  const props={busy:false,host:true,ownSeat:0,connected:true,onChoice,onFinish:()=>{},onRematch:()=>{},onLeave:()=>{}};
  const rendered=render(<GameRoom {...props} room={room(view)}/>);
  fireEvent.click(screen.getByRole("button",{name:"杠"}));
  expect(screen.getByRole("dialog",{name:"选择杠牌"})).toBeTruthy();
  rendered.rerender(<GameRoom {...props} room={room({...view,decisionId:"next",choices:[]})}/>);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(onChoice).not.toHaveBeenCalled();
});

it("shows a red-five triplet as pon in both the public meld and its acknowledged feedback", () => {
  vi.useFakeTimers(); const view=fixtureGame().view(0);
  const props={busy:false,host:true,ownSeat:0,connected:true,onChoice:()=>{},onFinish:()=>{},onRematch:()=>{},onLeave:()=>{}};
  const rendered=render(<GameRoom {...props} room={room(view)}/>);
  rendered.rerender(<GameRoom {...props} room={room({...view,decisionId:'red-pon',players:view.players.map(p=>p.seat===1 ? {...p,melds:['p055+']} : p)})}/>);
  expect(screen.getByRole('status',{name:'牌桌动作'}).textContent).toContain('碰');
  expect(document.querySelector('.mahjong-player__melds .mahjong-meld')?.getAttribute('aria-label')).toBe('碰');
});
