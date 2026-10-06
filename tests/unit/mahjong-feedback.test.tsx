// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Majiang from "@kobalab/majiang-core";
import type { GameView, RoomMember } from "@/modules/mahjong/types";
import { useTableFeedback } from "@/components/mahjong/use-table-feedback";
import { RiichiGame } from "@/modules/mahjong/engine";
import { SanmaGame } from "@/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "@/modules/mahjong/sanma-wall";

function game(overrides: Partial<GameView> = {}): GameView {
  return {
    gameInstanceId: "game-a",
    handId: 1,
    decisionId: "decision-a",
    phase: "qipai",
    roundWind: 0,
    roundNumber: 1,
    honba: 0,
    riichiSticks: 0,
    remainingTiles: 70,
    doraIndicators: [],
    turnSeat: 0,
    hand: ["p1", "p2"],
    drawnTile: null,
    players: Array.from({ length: 3 }, (_, seat) => ({
      seat, wind: seat, score: 35000, handCount: 13, discards: [], melds: [], riichi: false, nuki: 0,
    })),
    choices: [],
    settlement: null,
    ranking: null,
    ...overrides,
  };
}

function members(names = ["P0", "P1", "P2"]): RoomMember[] {
  return names.map((displayName, seat) => ({
    userId: `user-${seat}`, displayName, kind: "human", seat, ready: true, connected: true,
  }));
}

describe("useTableFeedback lifecycle and event recognition", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("uses a new game instance as a quiet baseline even when the round is unchanged", () => {
    const { result, rerender } = renderHook(({ current }) => useTableFeedback(current, members(), 0, "room-a"), {
      initialProps: { current: game() },
    });

    rerender({ current: game({
      gameInstanceId: "game-b",
      decisionId: "decision-b",
      players: game().players.map((player, seat) => seat === 1 ? { ...player, nuki: 1 } : player),
    }) });

    expect(result.current).toBeNull();
  });

  it("uses a new hand id as a quiet baseline for riichi and calls", () => {
    const { result, rerender } = renderHook(({ current }) => useTableFeedback(current, members(), 0, "room-a"), {
      initialProps: { current: game() },
    });

    rerender({ current: game({
      handId: 2,
      decisionId: "decision-b",
      players: game().players.map((player, seat) => seat === 1 ? { ...player, riichi: true } : player),
    }) });
    expect(result.current).toBeNull();

    rerender({ current: game({
      handId: 3,
      decisionId: "decision-c",
      players: game().players.map((player, seat) => seat === 1 ? { ...player, melds: ["m123-"] } : player),
    }) });
    expect(result.current).toBeNull();
  });

  it("does not replay a same-decision event when member display names refresh", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ currentGame, currentMembers }) => useTableFeedback(currentGame, currentMembers, 0, "room-a"), {
      initialProps: { currentGame: game(), currentMembers: members() },
    });

    const riichi = game({
      decisionId: "decision-b",
      players: game().players.map((player, seat) => seat === 1 ? { ...player, riichi: true } : player),
    });
    rerender({ currentGame: riichi, currentMembers: members() });
    expect(result.current).toMatchObject({ kind: "riichi", text: "P1 · 立直" });

    act(() => vi.advanceTimersByTime(900));
    expect(result.current).toBeNull();
    rerender({ currentGame: riichi, currentMembers: members(["P0", "牌友一", "P2"]) });
    expect(result.current).toBeNull();
  });

  it("keeps an ordinary draw visible once and suppresses the repeated decision snapshot", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ current }) => useTableFeedback(current, members(), 0, "room-a"), {
      initialProps: { current: game() },
    });

    const draw = game({ decisionId: "decision-b", phase: "zimo", drawnTile: "p3", turnSeat: 0 });
    rerender({ current: draw });
    expect(result.current).toMatchObject({ kind: "draw", text: "摸牌" });

    act(() => vi.advanceTimersByTime(900));
    rerender({ current: draw });
    expect(result.current).toBeNull();
  });

  it.each([
    ["red five pon", "p550-", "碰"],
    ["red five kan", "p550-5", "杠"],
  ])("recognizes %s from the canonical meld notation", (_label, meld, expected) => {
    const { result, rerender } = renderHook(({ current }) => useTableFeedback(current, members(), 0, "room-a"), {
      initialProps: { current: game() },
    });

    rerender({ current: game({
      decisionId: "decision-b",
      players: game().players.map((player, seat) => seat === 1 ? { ...player, melds: [meld] } : player),
    }) });

    expect(result.current).toMatchObject({ kind: "call", text: `P1 · ${expected}` });
  });

  it("baselines non-animating GET and reconnect snapshots, then accepts the next live event", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ currentGame, options }) => useTableFeedback(currentGame, members(), 0, "room-a", options), {
      initialProps: { currentGame: game(), options: { connected: false, canAnimate: false } },
    });

    const historicalNuki = game({
      decisionId: "decision-b",
      players: game().players.map((player, seat) => seat === 1 ? { ...player, nuki: 1 } : player),
    });
    rerender({ currentGame: historicalNuki, options: { connected: false, canAnimate: false } });
    expect(result.current).toBeNull();

    rerender({ currentGame: historicalNuki, options: { connected: true, canAnimate: false } });
    expect(result.current).toBeNull();

    const liveRiichi = game({
      decisionId: "decision-c",
      players: game().players.map((player, seat) => seat === 1 ? { ...player, riichi: true } : player),
    });
    rerender({ currentGame: liveRiichi, options: { connected: true, canAnimate: true } });
    expect(result.current).toMatchObject({ kind: "riichi", text: "P1 · 立直" });
  });

  it("keeps a live feedback through a connected quiet duplicate, then clears it on disconnect", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ currentGame, source }) => useTableFeedback(currentGame, members(), 0, "room-a", source), {
      initialProps: { currentGame: game(), source: { connected: true, canAnimate: false } },
    });
    const nuki = game({
      decisionId: "decision-b",
      players: game().players.map((player, seat) => seat === 1 ? { ...player, nuki: 1 } : player),
    });
    rerender({ currentGame: nuki, source: { connected: true, canAnimate: true } });
    expect(result.current).toMatchObject({ kind: "nuki", text: "P1 · 拔北" });

    rerender({ currentGame: nuki, source: { connected: true, canAnimate: false } });
    expect(result.current).toMatchObject({ kind: "nuki", text: "P1 · 拔北" });

    rerender({ currentGame: nuki, source: { connected: false, canAnimate: false } });
    expect(result.current).toBeNull();
  });

  it("recognizes a real SanmaGame nuki from before and after public views", () => {
    const engine = new SanmaGame("east", ["A", "B", "C"], sanmaFixture({ 0: "m19p123s123z11444" }, ["p9"]));
    const before = engine.view(0);
    const nuki = before.choices.find(choice => choice.type === "nuki");
    expect(nuki).toBeDefined();

    const { result, rerender } = renderHook(({ current }) => useTableFeedback(current, members(), 0, "room-a"), {
      initialProps: { current: before },
    });
    engine.respond(0, before.decisionId, nuki!.id);
    for (const seat of [1, 2]) {
      const response = engine.view(seat).choices.find(choice => choice.type === "pass");
      if (response) engine.respond(seat, engine.view(seat).decisionId, response.id);
    }
    const after = engine.view(0);
    expect(after.players.find(player => player.seat === 0)?.nuki).toBe(1);
    rerender({ current: after });
    expect(result.current).toMatchObject({ kind: "nuki", text: "你 · 拔北" });
  });

  it("recognizes a real yonma pon from before and after public views", () => {
    const engine = new RiichiGame("east", ["A", "B", "C", "D"], riichiFixture(
      { 0: "m123p123s123z1134", 1: "m123p123s123z3345" }, "p9",
    ));
    const before = engine.view(1);
    const { result, rerender } = renderHook(({ current }) => useTableFeedback(current, members(["A", "B", "C", "D"]), 1, "room-a"), {
      initialProps: { current: before },
    });
    const discard = engine.view(0).choices.find(choice => choice.type === "discard" && choice.value === "z3");
    expect(discard).toBeDefined();
    const discardView = engine.view(0);
    engine.respond(0, discardView.decisionId, discard!.id);
    const caller = engine.view(1);
    const pon = caller.choices.find(choice => choice.type === "pon");
    expect(pon).toBeDefined();
    engine.respond(1, caller.decisionId, pon!.id);
    const after = engine.view(1);
    expect(after.players.find(player => player.seat === 1)?.melds).toHaveLength(1);
    rerender({ current: after });
    expect(result.current).toMatchObject({ kind: "call", text: "你 · 碰" });
  });
});

function sanmaFixture(hands: Record<number, string>, draws: string[]) {
  return { dealer: 0, wallFactory: () => {
    const available = sanmaTiles();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      if (index < 0) throw new Error(`Impossible Sanma test tile: ${tile}`);
      return available.splice(index, 1)[0];
    };
    const dealt = [0, 1, 2].map(seat => hands[seat]
      ? [...hands[seat].matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(n => take(match[1] + n)))
      : []);
    for (const hand of dealt) if (!hand.length) hand.push(...available.splice(0, 13));
    const drawn = draws.map(take);
    const live = [...drawn, ...available.splice(0, 55 - drawn.length)];
    const replacement = available.splice(0, 4);
    const indicators = available.splice(0, 10);
    return new SanmaWall([...dealt.flat(), ...live, ...replacement, ...indicators]);
  } };
}

function riichiFixture(hands: Record<number, string>, drawn: string) {
  return { dealer: 0, wallFactory: (rule: ConstructorParameters<typeof Majiang.Shan>[0]) => {
    const wall = new Majiang.Shan(rule);
    const available = wall._pai.slice();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      if (index < 0) throw new Error(`Impossible Riichi test tile: ${tile}`);
      return available.splice(index, 1)[0];
    };
    const dealt: string[][] = [[], [], [], []];
    for (const [seat, encoded] of Object.entries(hands)) {
      dealt[Number(seat)] = [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(n => take(match[1] + n)));
      if (dealt[Number(seat)].length !== 13) throw new Error("Riichi test hand must have 13 tiles");
    }
    take(drawn);
    for (let seat = 0; seat < 4; seat++) if (!dealt[seat].length) dealt[seat] = available.splice(0, 13);
    wall._pai = [...available, ...[...dealt.flat(), drawn].reverse()];
    wall._baopai = [wall._pai[4]];
    wall._fubaopai = [wall._pai[9]];
    return wall;
  } };
}
