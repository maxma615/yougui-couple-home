// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameRoom } from "@/components/mahjong/mahjong-client";
import { SanmaGame } from "@/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "@/modules/mahjong/sanma-wall";
import type { GameView, RoomView } from "@/modules/mahjong/types";

afterEach(cleanup);
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
