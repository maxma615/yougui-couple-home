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
  [document, "fullscreenElement"], [document, "elementFromPoint"], [window.screen, "orientation"],
  [HTMLDialogElement.prototype, "showModal"],
].map(([target, key]) => ({ target: target as object, key: key as string, descriptor: Object.getOwnPropertyDescriptor(target as object, key as string) }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

it("keeps a useful rotation hint in portrait when fullscreen is unavailable, without sending a game command", async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => Object.assign(new EventTarget(), {matches:false})));
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

it("separates an opponent's actual drawn back and rejoins the rack after a legal discard", () => {
  const game = fixtureGame(), before = game.view(1), onChoice = vi.fn(), noop = () => {};
  const props = (view: GameView) => ({ room: { ...room(view), mySeat: 1 }, ownSeat: 1, host: false,
    busy: false, connected: true, motionCanAnimate: false, onChoice, onFinish: noop, onLeave: noop, onRematch: noop });
  const { rerender } = render(<GameRoom {...props(before)}/>);
  const rack = document.querySelector('[data-motion-rack-seat="0"]')!;
  expect(rack.querySelectorAll('i')).toHaveLength(14);
  expect(rack.querySelectorAll('i.is-drawn[data-motion-drawn="true"]')).toHaveLength(1);
  expect(rack.querySelectorAll('[data-tile-face]')).toHaveLength(0);
  const actor = game.view(0), discard = actor.choices.find(choice => choice.type === "discard");
  expect(discard).toBeDefined();
  game.respond(0, actor.decisionId, discard!.id);
  rerender(<GameRoom {...props(game.view(1))}/>);
  expect(rack.querySelectorAll('i')).toHaveLength(13);
  expect(rack.querySelectorAll('i.is-drawn')).toHaveLength(0);
  expect(onChoice).not.toHaveBeenCalled();
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

it("opens readable public meld details with identifiable declared kans without making a game decision", () => {
  const view = fixtureGame().view(0);
  view.players[1].melds = ["p111+", "s4444"];
  const onChoice = show(view);
  fireEvent.click(screen.getByRole("button", {name:"查看玩家1的公开副露"}));
  const dialog = document.querySelector(".mahjong-public-melds")!;
  expect(dialog.getAttribute("aria-label")).toBe("玩家1的公开副露");
  expect(dialog.querySelectorAll('[data-tile-face="p1"]')).toHaveLength(3);
  expect(dialog.querySelectorAll('.mahjong-meld__back')).toHaveLength(2);
  expect(dialog.querySelectorAll('[data-tile-face="s4"]')).toHaveLength(2);
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

it("requires a second activation of the same physical tile before sending its legal discard", () => {
  const view = fixtureGame().view(0);
  view.hand = ["p1", "p1", "p2"];
  view.drawnTile = null;
  const discard = { id: "discard:p1", type: "discard" as const, value: "p1" };
  view.choices = [discard];
  const onChoice = show(view);
  const copies = screen.getAllByRole("button", { name: "切出 一筒" });

  fireEvent.click(copies[0]);
  expect(onChoice).not.toHaveBeenCalled();
  expect(copies[0].getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(copies[1]);
  expect(onChoice).not.toHaveBeenCalled();
  expect(copies[0].getAttribute("aria-pressed")).toBe("false");
  expect(copies[1].getAttribute("aria-pressed")).toBe("true");

  fireEvent.click(copies[1]);
  expect(onChoice).toHaveBeenCalledTimes(1);
  expect(onChoice).toHaveBeenCalledWith(discard);
});

it("clears a selected tile and disables submission while busy or disconnected", () => {
  const view = fixtureGame().view(0);
  view.hand = ["p1", "p2"];
  view.drawnTile = null;
  const discard = { id: "discard:p1", type: "discard" as const, value: "p1" };
  view.choices = [discard];
  const onChoice = vi.fn();
  const props = { host: true, ownSeat: 0, onChoice, onFinish: () => {}, onRematch: () => {}, onLeave: () => {} };
  const mounted = render(<GameRoom room={room(view)} busy={false} connected {...props}/>);
  const tile = screen.getByRole("button", { name: "切出 一筒" });
  fireEvent.click(tile);
  expect(tile.getAttribute("aria-pressed")).toBe("true");

  mounted.rerender(<GameRoom room={room(view)} busy={true} connected {...props}/>);
  expect((tile as HTMLButtonElement).disabled).toBe(true);
  expect(tile.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(tile);
  expect(onChoice).not.toHaveBeenCalled();

  mounted.rerender(<GameRoom room={room(view)} busy={false} connected={false} {...props}/>);
  expect((tile as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(tile);
  expect(onChoice).not.toHaveBeenCalled();
});

it("submits a tile only after a real drag clears the distance threshold and lands inside the table", () => {
  const view = fixtureGame().view(0);
  view.hand = ["p1", "p2"];
  view.drawnTile = null;
  const discard = { id: "discard:p1", type: "discard" as const, value: "p1" };
  view.choices = [discard];
  const onChoice = show(view);
  const tile = screen.getByRole("button", { name: "切出 一筒" });
  const board = screen.getByTestId("mahjong-board");
  Object.defineProperty(board, "getBoundingClientRect", { configurable: true, value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400, toJSON: () => ({}) }) });
  const rack = screen.getByTestId("mahjong-hand");
  Object.defineProperty(rack, "getBoundingClientRect", { configurable: true, value: () => ({ top: 320 }) });
  const center = board.querySelector(".mahjong-table__center")!;
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: (x: number, y: number) => x >= 250 && x <= 350 && y >= 140 && y <= 220 ? center : document.body });

  fireEvent.pointerDown(tile, { pointerId: 1, isPrimary: true, button: 0, clientX: 30, clientY: 350 });
  fireEvent.pointerMove(tile, { pointerId: 1, isPrimary: true, button: 0, clientX: 34, clientY: 350 });
  fireEvent.pointerUp(tile, { pointerId: 1, isPrimary: true, button: 0, clientX: 34, clientY: 350 });
  fireEvent.click(tile);
  expect(onChoice).not.toHaveBeenCalled();

  fireEvent.pointerDown(tile, { pointerId: 2, isPrimary: true, button: 0, clientX: 30, clientY: 350 });
  fireEvent.pointerMove(tile, { pointerId: 2, isPrimary: true, button: 0, clientX: 700, clientY: 500 });
  expect(tile.classList.contains("is-dragging")).toBe(true);
  fireEvent.pointerUp(tile, { pointerId: 2, isPrimary: true, button: 0, clientX: 700, clientY: 500 });
  expect(onChoice).not.toHaveBeenCalled();

  fireEvent.pointerDown(tile, { pointerId: 3, isPrimary: true, button: 0, clientX: 30, clientY: 350 });
  fireEvent.pointerMove(tile, { pointerId: 3, isPrimary: true, button: 0, clientX: 300, clientY: 180 });
  expect(tile.classList.contains("is-dragging")).toBe(true);
  expect(board.classList.contains("is-discard-target")).toBe(true);
  fireEvent.pointerUp(tile, { pointerId: 3, isPrimary: true, button: 0, clientX: 300, clientY: 180 });
  expect(onChoice).toHaveBeenCalledTimes(1);
  expect(onChoice).toHaveBeenCalledWith(discard);
});

it("cancels a drag without submitting even when the operating system cancels over the table center", () => {
  const view = fixtureGame().view(0);
  view.hand = ["p1"];
  view.drawnTile = null;
  const discard = { id: "discard:p1", type: "discard" as const, value: "p1" };
  view.choices = [discard];
  const onChoice = show(view);
  const tile = screen.getByRole("button", { name: "切出 一筒" });
  const board = screen.getByTestId("mahjong-board");
  const rack = screen.getByTestId("mahjong-hand");
  Object.defineProperty(rack, "getBoundingClientRect", { configurable: true, value: () => ({ top: 320 }) });
  const center = board.querySelector(".mahjong-table__center")!;
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => center });

  fireEvent.pointerDown(tile, { pointerId: 9, isPrimary: true, button: 0, clientX: 30, clientY: 350 });
  fireEvent.pointerMove(tile, { pointerId: 9, isPrimary: true, button: 0, clientX: 300, clientY: 180 });
  expect(board.classList.contains("is-discard-target")).toBe(true);
  fireEvent.pointerCancel(tile, { pointerId: 9, isPrimary: true, button: 0, clientX: 300, clientY: 180 });

  expect(onChoice).not.toHaveBeenCalled();
  expect(board.classList.contains("is-discard-target")).toBe(false);
  expect(tile.classList.contains("is-dragging")).toBe(false);
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
  const tile = screen.getByRole("button",{name:"立直后切出 北风"});
  fireEvent.click(tile);
  expect(onChoice).not.toHaveBeenCalled();
  expect(tile.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(tile);
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
  rendered.rerender(<GameRoom {...props} room={room({...view,decisionId:'red-pon',players:view.players.map(p=>p.seat===1 ? {...p,melds:['p505+']} : p)})}/>);
  expect(screen.getByRole('status',{name:'牌桌动作'}).textContent).toContain('碰');
  expect(document.querySelector('.mahjong-player__melds .mahjong-meld')?.getAttribute('aria-label')).toBe('碰，来自下家');
});

it("shows all three tiles when a chi option's source marker is inside the sequence", () => {
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  const view=fixtureGame().view(0);
  const first={id:"chi:p12-3",type:"chi" as const,value:"p12-3"};
  view.choices=[first,{id:"chi:p2-34",type:"chi",value:"p2-34"},{id:"pass",type:"pass"}];
  const onChoice=show(view);
  fireEvent.click(screen.getByRole("button",{name:"吃"}));
  const dialog=screen.getByRole("dialog",{name:"选择吃牌"});
  const option=dialog.querySelector<HTMLButtonElement>('[data-choice-id="chi:p12-3"]')!;
  expect([...option.querySelectorAll('[data-tile-face]')].map(tile=>tile.getAttribute('data-tile-face'))).toEqual(["p2","p1","p3"]);
  expect(option.querySelector('[data-called] [data-tile-face]')?.getAttribute("data-tile-face")).toBe("p2");
  expect(option.getAttribute('aria-label')).toBe('1筒 2筒 3筒');
  fireEvent.click(option);
  expect(onChoice).toHaveBeenCalledWith(first);
});


it("uses playable felt above the original rack for both drag preview and one legal release", () => {
  const view = fixtureGame().view(0);
  const discard = view.choices.find(c => c.type === "discard" && !c.value?.endsWith("_"))!;
  const onChoice = show(view);
  const tile = document.querySelector<HTMLButtonElement>(`[data-choice-id="${discard.id}"]`)!;
  const board = screen.getByTestId("mahjong-board");
  const rack = screen.getByTestId("mahjong-hand");
  Object.defineProperty(rack, "getBoundingClientRect", { configurable: true, value: () => ({ top: 320 }) });
  const felt = screen.getByTestId("mahjong-table-surface");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => felt });
  fireEvent.pointerDown(tile, { pointerId: 12, isPrimary: true, button: 0, clientX: 80, clientY: 350 });
  fireEvent.pointerMove(tile, { pointerId: 12, clientX: 80, clientY: 240 });
  expect(board.classList.contains("is-discard-target")).toBe(true);
  fireEvent.pointerUp(tile, { pointerId: 12, clientX: 80, clientY: 240 });
  fireEvent.pointerUp(tile, { pointerId: 12, clientX: 80, clientY: 240 });
  expect(onChoice).toHaveBeenCalledExactlyOnceWith(discard);
});

it("losing capture cancels a selected drag and suppresses the subsequent pointer click", () => {
  const view = fixtureGame().view(0);
  const discard = view.choices.find(c => c.type === "discard" && !c.value?.endsWith("_"))!;
  const onChoice = show(view);
  const tile = document.querySelector<HTMLButtonElement>(`[data-choice-id="${discard.id}"]`)!;
  const rack = screen.getByTestId("mahjong-hand");
  Object.defineProperty(rack, "getBoundingClientRect", { configurable: true, value: () => ({ top: 320 }) });
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => screen.getByTestId("mahjong-table-surface") });
  fireEvent.click(tile);
  fireEvent.pointerDown(tile, { pointerId: 14, isPrimary: true, button: 0, clientX: 80, clientY: 350 });
  fireEvent.pointerMove(tile, { pointerId: 14, clientX: 80, clientY: 240 });
  fireEvent.lostPointerCapture(tile, { pointerId: 14, clientX: 80, clientY: 240 });
  expect(tile.classList.contains("is-dragging")).toBe(false);
  fireEvent.pointerUp(tile, { pointerId: 14, clientX: 80, clientY: 240 });
  fireEvent.click(tile, { detail: 1 });
  expect(onChoice).not.toHaveBeenCalled();
  expect(tile.classList.contains("is-dragging")).toBe(false);
});

it("cancels the pointer sequence even if capture is lost before reaching the drag threshold", () => {
  const view = fixtureGame().view(0);
  const discard = view.choices.find(c => c.type === "discard" && !c.value?.endsWith("_"))!;
  const onChoice = show(view);
  const tile = document.querySelector<HTMLButtonElement>(`[data-choice-id="${discard.id}"]`)!;
  fireEvent.click(tile);
  fireEvent.pointerDown(tile, { pointerId: 18, isPrimary: true, button: 0, clientX: 80, clientY: 350 });
  fireEvent.pointerMove(tile, { pointerId: 18, clientX: 83, clientY: 350 });
  fireEvent.lostPointerCapture(tile, { pointerId: 18, clientX: 83, clientY: 350 });
  fireEvent.click(tile, { detail: 1 });
  expect(onChoice).not.toHaveBeenCalled();
  expect(tile.getAttribute("aria-pressed")).toBe("false");
});
