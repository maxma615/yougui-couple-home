// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameRoom } from "@/components/mahjong/mahjong-client";
import { northReplacementFixture } from "../fixtures/mahjong-view-game";
import type { RoomView } from "@/modules/mahjong/types";

afterEach(cleanup);
function show(ownSeat = 0) {
  const game = northReplacementFixture();
  const before = game.view(0), choice = before.choices.find(c => c.type === "nuki")!;
  game.respond(0, before.decisionId, choice.id);
  const view = game.view(ownSeat), onChoice = vi.fn();
  const room: RoomView = { id: "projection", code: "ABCDEFGH", hostUserId: "0", variant: "sanma", mode: "east", status: "playing", version: 1, mySeat: ownSeat, game: view,
    members: view.players.map(p => ({ userId: String(p.seat), seat: p.seat, kind: "human", displayName: `玩家${p.seat}`, ready: true, connected: true })) };
  render(<GameRoom room={room} ownSeat={ownSeat} host busy={false} connected motionCanAnimate={false} onChoice={onChoice} onFinish={() => {}} onLeave={() => {}} onRematch={() => {}}/>);
  return { room, onChoice };
}

it("groups physical racks, rivers and readout into one projected surface while keeping touch/HUD upright", () => {
  const { room } = show();
  const board = screen.getByTestId("mahjong-board"), surface = board.querySelector(".mahjong-table__surface");
  expect(surface).not.toBeNull();
  expect(surface?.querySelectorAll(".mahjong-table__center")).toHaveLength(1);
  expect(surface?.querySelectorAll(".mahjong-river")).toHaveLength(3);
  expect(surface?.querySelectorAll(".mahjong-opponent-rack")).toHaveLength(2);
  expect(surface?.querySelectorAll(".mahjong-player__head,.mahjong-hand,.mahjong-table__dora")).toHaveLength(0);
  expect(board.querySelectorAll(".mahjong-player")).toHaveLength(room.game!.players.length);
  expect(board.querySelectorAll(".mahjong-player__head")).toHaveLength(room.game!.players.length);
  expect(screen.getByTestId("mahjong-hand").closest(".mahjong-table__surface")).toBeNull();
  expect(screen.getByTestId("mahjong-dora").closest(".mahjong-table__surface")).toBeNull();
  expect(screen.getByTestId("nuki-tiles-0").querySelectorAll('[data-tile-face="z4"]')).toHaveLength(1);
  expect(screen.getByTestId("nuki-tiles-0").closest(".mahjong-table__surface")).not.toBeNull();
});

it("puts the viewer's declared tiles on the physical table rather than in the touch rack", () => {
  const game = northReplacementFixture();
  const view = game.view(0);
  // The mounted real-engine audit independently covers legal kan progression.
  view.players[0].melds = ["p5555"];
  const noop = () => {};
  const room: RoomView = { id: "own-public", code: "ABCDEFGH", hostUserId: "0", variant: "sanma", mode: "east", status: "playing", version: 1, mySeat: 0, game: view, members: view.players.map(p => ({ userId: String(p.seat), seat: p.seat, kind: "human", displayName: `玩家${p.seat}`, ready: true, connected: true })) };
  render(<GameRoom room={room} ownSeat={0} host busy={false} connected motionCanAnimate={false} onChoice={noop} onFinish={noop} onLeave={noop} onRematch={noop}/>);
  const meld = screen.getByRole("group", { name: "你的公开副露" });
  expect(meld.closest(".mahjong-table__surface")).not.toBeNull();
  expect(meld.closest(".mahjong-hand-line")).toBeNull();
  expect(meld.querySelectorAll(".mahjong-meld__back")).toHaveLength(2);
  expect(screen.getByTestId("mahjong-hand").closest(".mahjong-table__surface")).toBeNull();
});

it("leaves the public inspect action on the flat identity card and never sends a game decision", () => {
  const { onChoice } = show();
  const inspect = screen.getByRole("button", { name: "查看玩家0的公开副露" });
  expect(inspect.closest(".mahjong-table__surface")).toBeNull();
  fireEvent.click(inspect);
  expect(screen.getByRole("button", { name: "关闭副露详情", hidden: true })).toBeTruthy();
  expect(onChoice).not.toHaveBeenCalled();
});

it("keeps an opponent's extracted North visible on the surface with a flat inspect target", () => {
  const { onChoice } = show(1);
  const north = screen.getByTestId("nuki-tiles-0");
  expect(north.closest(".mahjong-table__surface")).not.toBeNull();
  expect(north.querySelectorAll('[data-tile-face="z4"]')).toHaveLength(1);
  const inspect = screen.getByRole("button", { name: "查看玩家0的公开副露" });
  expect(inspect.closest(".mahjong-table__surface")).toBeNull();
  fireEvent.click(inspect);
  expect(screen.getByRole("button", { name: "关闭副露详情", hidden: true })).toBeTruthy();
  expect(north.querySelectorAll('[data-tile-face="z4"]')).toHaveLength(1);
  expect(onChoice).not.toHaveBeenCalled();
});
