// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GameRoom } from "@/components/mahjong/mahjong-client";
import { SanmaGame } from "@/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "@/modules/mahjong/sanma-wall";
import type { GameView, RoomView } from "@/modules/mahjong/types";

const screenDescriptors = [
  [document.documentElement, "requestFullscreen"], [document, "exitFullscreen"],
  [document, "fullscreenElement"], [window.screen, "orientation"],
].map(([target, key]) => ({ target: target as object, key: key as string, descriptor: Object.getOwnPropertyDescriptor(target as object, key as string) }));
afterEach(() => {
  cleanup();
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
function fixtureGame() {
  return new SanmaGame("east", ["A", "B", "C"], { dealer: 0, wallFactory: () => {
    const available = sanmaTiles();
    const take = (tile: string) => { const index = available.indexOf(tile); if (index < 0) throw new Error("Impossible fixture"); return available.splice(index, 1)[0]; };
    const hand = [..."123456789"].map(n => take(`p${n}`)).concat([..."123"].map(n => take(`s${n}`)), take("z2"));
    const north = take("z4"), replacement = take("z2");
    const others = available.splice(0, 26), reserve = [replacement, ...available.splice(0, 3)], indicators = available.splice(0, 10);
    return new SanmaWall([...hand, ...others, north, ...available, ...reserve, ...indicators]);
  } });
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

it("keeps self draw and riichi controls visible but unavailable outside a legal decision", () => {
  const view = fixtureGame().view(0);
  view.choices = []; view.turnSeat = 1; view.drawnTile = null;
  const onChoice = show(view);
  const tsumo = screen.getByRole("button", {name:"自摸"});
  const riichi = screen.getByRole("button", {name:"立直"});
  expect((tsumo as HTMLButtonElement).disabled).toBe(true);
  expect((riichi as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(tsumo); fireEvent.click(riichi);
  expect(onChoice).not.toHaveBeenCalled();
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
