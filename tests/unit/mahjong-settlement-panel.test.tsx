// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Majiang from "@kobalab/majiang-core";
import { MahjongSettlementPanel } from "@/components/mahjong/mahjong-settlement-panel";
import { RiichiGame } from "@/modules/mahjong/engine";
import { SanmaGame } from "@/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "@/modules/mahjong/sanma-wall";
import type { Choice, GameView, GameVariant, RoomView } from "@/modules/mahjong/types";

afterEach(cleanup);

function roomFor(game: GameView, variant: GameVariant, mySeat: number): RoomView {
  const count = variant === "sanma" ? 3 : 4;
  return {
    id: "room-1", code: "TEST", hostUserId: "u0", variant, mode: "east", status: "playing", version: 1, mySeat,
    members: Array.from({ length: count }, (_, seat) => ({
      userId: `u${seat}`, displayName: `玩家${seat + 1}`, kind: "human", seat, ready: true, connected: true,
    })),
    game,
  };
}

function sanmaFixture(hands: Record<number, string>, draws: string[]) {
  const toTiles = (encoded: string) => [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap((m) => [...m[2]].map((n) => m[1] + n));
  return { dealer: 0, wallFactory: () => {
    const available = sanmaTiles();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      if (index < 0) throw new Error(`Impossible physical sanma tile: ${tile}`);
      return available.splice(index, 1)[0];
    };
    const dealt = [0, 1, 2].map((seat) => hands[seat] ? toTiles(hands[seat]).map(take) : []);
    const drawn = draws.map(take);
    for (const hand of dealt) if (!hand.length) hand.push(...available.splice(0, 13));
    const live = available.splice(0, 54), reserve = available.splice(0, 4), indicators = available.splice(0, 10);
    return new SanmaWall([...dealt.flat(), ...drawn, ...live, ...reserve, ...indicators]);
  } };
}

function yonmaFixture(hands: Record<number, string>, drawn: string) {
  return { dealer: 0, wallFactory: (rule: ConstructorParameters<typeof Majiang.Shan>[0]) => {
    const wall = new Majiang.Shan(rule), available = wall._pai.slice();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      if (index < 0) throw new Error(`Impossible physical yonma tile: ${tile}`);
      return available.splice(index, 1)[0];
    };
    const dealt: string[][] = [[], [], [], []];
    for (const [seatText, encoded] of Object.entries(hands)) {
      const seat = Number(seatText);
      dealt[seat] = [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap((m) => [...m[2]].map((n) => take(m[1] + n)));
      if (dealt[seat].length !== 13) throw new Error("Fixture hand must contain 13 physical tiles");
    }
    const actualDraw = take(drawn);
    for (let seat = 0; seat < 4; seat++) if (!dealt[seat].length) dealt[seat] = available.splice(0, 13);
    wall._pai = [...available, ...[...dealt, [actualDraw]].flat().reverse()];
    wall._baopai = [wall._pai[4]];
    wall._fubaopai = [wall._pai[9]];
    return wall;
  } };
}

function panel(game: GameView, variant: GameVariant, seat: number, options: { connected?: boolean; busy?: boolean; onChoice?: (choice: Choice) => void } = {}) {
  return <MahjongSettlementPanel
    game={game}
    room={roomFor(game, variant, seat)}
    connected={options.connected ?? true}
    busy={options.busy ?? false}
    onChoice={options.onChoice ?? (() => {})}
  />;
}

function actWithChoice(game: SanmaGame | RiichiGame, seat: number, type: Choice["type"], value?: string) {
  const view = game.view(seat);
  const choice = view.choices.find((item) => item.type === type && (value === undefined || item.value === value));
  expect(choice, `seat ${seat} should have a legal ${type} choice`).toBeDefined();
  game.respond(seat, view.decisionId, choice!.id);
}

function clickActualAck(game: SanmaGame | RiichiGame, variant: GameVariant, seat: number, rerender: (ui: ReturnType<typeof panel>) => void) {
  const view = game.view(seat);
  rerender(panel(view, variant, seat, { onChoice: (choice) => game.respond(seat, view.decisionId, choice.id) }));
  act(() => fireEvent.click(screen.getByRole("button", { name: "继续" })));
}

describe("Mahjong settlement balances", () => {
  it("previews each yonma balance and applies it only after all real ACK choices", () => {
    const game = new RiichiGame("east", ["A", "B", "C", "D"], yonmaFixture({ 0: "m123p123s123z1112" }, "z2"));
    actWithChoice(game, 0, "tsumo");
    const opening = game.view(0);
    expect(opening.players.map((player) => player.score)).toEqual([25000, 25000, 25000, 25000]);
    expect(opening.settlement?.delta).toEqual([48000, -16000, -16000, -16000]);

    const { rerender } = render(panel(opening, "yonma", 0, {
      onChoice: (choice) => game.respond(0, opening.decisionId, choice.id),
    }));
    const winner = within(document.querySelector('[data-settlement-seat="0"]')!);
    expect(winner.getByText("结算前 25,000")).not.toBeNull();
    expect(winner.getByText("获得 +48,000")).not.toBeNull();
    expect(winner.getByText("结算后 73,000")).not.toBeNull();
    expect(screen.getByText("牌型点数")).not.toBeNull();
    expect(screen.getByText("48,000 点")).not.toBeNull();
    expect(screen.getByText(/全部席位确认后.*计入分数/)).not.toBeNull();

    for (const seat of [0, 1, 2, 3]) {
      clickActualAck(game, "yonma", seat, rerender);
      if (seat < 3) expect(game.view(0).players.map((player) => player.score)).toEqual([25000, 25000, 25000, 25000]);
    }
    expect(game.view(0).handId).toBe(2);
    expect(game.view(0).settlement).toBeNull();
    expect(game.view(0).players.map((player) => player.score)).toEqual([73000, 9000, 9000, 9000]);
  });

  it("uses only the current delta for the second real sanma ron preview", () => {
    const game = new SanmaGame("east", ["A", "B", "C"], sanmaFixture({
      1: "p123456789s123z2", 2: "p123456789s123z2",
    }, ["z2"]));
    actWithChoice(game, 0, "discard", "z2_");
    actWithChoice(game, 2, "ron");
    actWithChoice(game, 1, "ron");

    const first = game.view(0);
    expect(first.settlement?.winnerSeat).toBe(1);
    expect(first.settlement?.delta).toEqual([-2600, 2600, 0]);
    const { rerender } = render(panel(first, "sanma", 0, {
      onChoice: (choice) => game.respond(0, first.decisionId, choice.id),
    }));
    expect(within(document.querySelector('[data-settlement-seat="0"]')!).getByText("结算后 32,400")).not.toBeNull();

    for (const seat of [0, 1, 2]) clickActualAck(game, "sanma", seat, rerender);
    const second = game.view(0);
    expect(second.players.map((player) => player.score)).toEqual([32400, 37600, 35000]);
    expect(second.settlement?.winnerSeat).toBe(2);
    expect(second.settlement?.delta).toEqual([-2600, 0, 2600]);
    rerender(panel(second, "sanma", 0, {
      onChoice: (choice) => game.respond(0, second.decisionId, choice.id),
    }));
    const loser = within(document.querySelector('[data-settlement-seat="0"]')!);
    expect(loser.getByText("结算前 32,400")).not.toBeNull();
    expect(loser.getByText("支付 −2,600")).not.toBeNull();
    expect(loser.getByText("结算后 29,800")).not.toBeNull();
    const secondWinner = within(document.querySelector('[data-settlement-seat="2"]')!);
    expect(secondWinner.getByText("结算前 35,000")).not.toBeNull();
    expect(secondWinner.getByText("获得 +2,600")).not.toBeNull();
    expect(secondWinner.getByText("结算后 37,600")).not.toBeNull();

    for (const seat of [0, 1, 2]) clickActualAck(game, "sanma", seat, rerender);
    expect(game.view(0).handId).toBe(2);
    expect(game.view(0).settlement).toBeNull();
    expect(game.view(0).players.map((player) => player.score)).toEqual([29800, 37600, 37600]);
  });

  it("keeps real ACK disabled while busy or disconnected and puts all copy inside the body region", () => {
    const game = new RiichiGame("east", ["A", "B", "C", "D"], yonmaFixture({ 0: "m123p123s123z1112" }, "z2"));
    actWithChoice(game, 0, "tsumo");
    const view = game.view(0);
    const { rerender, container } = render(panel(view, "yonma", 0, {
      connected: false,
      onChoice: (choice) => game.respond(0, view.decisionId, choice.id),
    }));
    const section = screen.getByRole("region", { name: "本局结算" });
    const content = section.querySelector(".mahjong-settlement-panel__content");
    const footer = section.querySelector("footer");
    expect(content).not.toBeNull();
    expect(footer?.parentElement).toBe(section);
    expect(Array.from(section.children)).toEqual([content, footer]);
    expect((within(footer as HTMLElement).getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(within(content as HTMLElement).getByText("结算后 73,000")).not.toBeNull();
    expect(container.querySelector(".mahjong-settlement-panel__delta")?.parentElement).toBe(content);
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    expect(game.view(0).settlement).not.toBeNull();
    expect(game.view(0).choices.some((choice) => choice.type === "ack")).toBe(true);

    rerender(panel(view, "yonma", 0, { busy: true, onChoice: (choice) => game.respond(0, view.decisionId, choice.id) }));
    expect((screen.getByRole("button", { name: "继续" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    expect(game.view(0).choices.some((choice) => choice.type === "ack")).toBe(true);
    rerender(panel(view, "yonma", 0, { connected: true, busy: false }));
    expect((screen.getByRole("button", { name: "继续" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("previews a physical sanma nine-terminals abort as zero change", () => {
    const game = new SanmaGame("east", ["A", "B", "C"], sanmaFixture({ 0: "m19p19s19z1234567" }, ["p2"]));
    actWithChoice(game, 0, "abort");
    const view = game.view(0);
    expect(view.settlement).toMatchObject({ kind: "draw", name: "九種九牌", delta: [0, 0, 0] });

    render(panel(view, "sanma", 0));
    for (let seat = 0; seat < 3; seat++) {
      const row = within(document.querySelector(`[data-settlement-seat="${seat}"]`)!);
      expect(row.getByText("结算前 35,000")).not.toBeNull();
      expect(row.getByText("不变 0")).not.toBeNull();
      expect(row.getByText("结算后 35,000")).not.toBeNull();
    }
  });

  it("formats a real yonma negative balance and removes its already-applied match-end settlement", () => {
    const game = new RiichiGame("east", ["A", "B", "C", "D"], yonmaFixture({ 0: "m111z555z666z777p2" }, "p2"));
    actWithChoice(game, 0, "tsumo");
    const view = game.view(0);
    expect(view.settlement?.delta).toEqual([192000, -64000, -64000, -64000]);
    expect(view.players.map((player) => player.score)).toEqual([25000, 25000, 25000, 25000]);

    const { rerender } = render(panel(view, "yonma", 0));
    const loser = within(document.querySelector('[data-settlement-seat="1"]')!);
    expect(loser.getByText("结算前 25,000")).not.toBeNull();
    expect(loser.getByText("支付 −64,000")).not.toBeNull();
    expect(loser.getByText("结算后 -39,000")).not.toBeNull();
    for (const seat of [0, 1, 2, 3]) clickActualAck(game, "yonma", seat, rerender);
    const finished = game.view(0);
    expect(finished.ranking).toHaveLength(4);
    expect(finished.players.map((player) => player.score)).toEqual([217000, -39000, -39000, -39000]);
    rerender(panel(finished, "yonma", 0));
    expect(screen.queryByRole("region", { name: "本局结算" })).toBeNull();
  });
});
