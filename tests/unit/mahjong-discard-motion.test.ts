import { describe, expect, it } from "vitest";
import { createDiscardEventId, DiscardMotionTracker, type DiscardMotionIntent } from "@/components/mahjong/discard-motion";
import type { GameView, RoomView } from "@/modules/mahjong/types";

function table(overrides: Partial<RoomView> = {}, gameOverrides: Partial<GameView> = {}): RoomView {
  const game: GameView = {
    gameInstanceId: "game-a",
    handId: 4,
    decisionId: "opaque-decision-a",
    phase: "zimo",
    roundWind: 0,
    roundNumber: 1,
    honba: 0,
    riichiSticks: 0,
    remainingTiles: 60,
    doraIndicators: [],
    turnSeat: 0,
    hand: ["p1", "p1", "p2"],
    drawnTile: null,
    players: [0, 1, 2].map(seat => ({ seat, wind: seat, score: 35000, handCount: 13, discards: [], melds: [], riichi: false })),
    choices: [{ id: "discard:p1", type: "discard", value: "p1" }, { id: "riichi:p1", type: "riichi", value: "p1" }],
    settlement: null,
    ranking: null,
    ...gameOverrides,
  };
  return {
    id: "room-a", code: "ABCDEFGH", hostUserId: "human", variant: "sanma", mode: "east",
    status: "playing", version: 10, mySeat: 0,
    members: [0, 1, 2].map(seat => ({ userId: seat ? `bot:${seat}` : "human", displayName: `P${seat}`, kind: seat ? "bot" : "human", seat, ready: true, connected: true })),
    game,
    ...overrides,
  };
}

function intent(overrides: Partial<DiscardMotionIntent> = {}): DiscardMotionIntent {
  return {
    roomId: "room-a", roomVersion: 10, gameInstanceId: "game-a", handId: 4,
    decisionId: "opaque-decision-a", seat: 0, choiceId: "riichi:p1", tileValue: "p1",
    sourceTileId: "hand:1:p1", sourceRect: { left: 160, top: 410, width: 44, height: 62 },
    sourceGeometry: { width: 44, height: 62, angle: 0, scale: 1 },
    environmentEpoch: 0,
    ...overrides,
  };
}

describe("DiscardMotionTracker", () => {
  it("uses opaque room, game, hand, seat and river index as a stable event identity", () => {
    expect(createDiscardEventId({ roomId: "room-a", gameInstanceId: "game-a", handId: 4, seat: 2, index: 3 }))
      .toBe("discard:room-a:game-a:4:2:3");
  });

  it("establishes a silent baseline and never replays the river already present", () => {
    const tracker = new DiscardMotionTracker();
    const initial = table();
    initial.game!.players[1].discards = ["m1", "p2"];

    expect(tracker.observe(initial, { canAnimate: true }).newEvents).toEqual([]);
    expect(tracker.observe(initial, { canAnimate: true }).newEvents).toEqual([]);
  });

  it("offers one live opponent discard once and deduplicates the same HTTP and socket snapshot", () => {
    const tracker = new DiscardMotionTracker();
    tracker.observe(table(), { canAnimate: false });
    const next = table({ version: 11 }, { decisionId: "opaque-decision-b", turnSeat: 2 });
    next.game!.players[2].discards = ["s4"];

    const first = tracker.observe(next, { canAnimate: true });
    expect(first.newEvents).toHaveLength(1);
    expect(first.flight).toMatchObject({ source: "opponent", event: { id: "discard:room-a:game-a:4:2:0", seat: 2, tile: "s4" } });

    expect(tracker.observe(next, { canAnimate: true }).newEvents).toEqual([]);
  });

  it("keeps the exact selected physical tile as the source of a confirmed riichi discard", () => {
    const tracker = new DiscardMotionTracker();
    const before = table();
    tracker.observe(before, { canAnimate: false });
    const next = table({ version: 11 }, { decisionId: "opaque-decision-b", turnSeat: 1 });
    next.game!.players[0].discards = ["p1*"];

    const result = tracker.observe(next, { canAnimate: true, intent: intent() });
    expect(result.flight).toMatchObject({
      source: "own",
      sourceTileId: "hand:1:p1",
      sourceRect: { left: 160, top: 410, width: 44, height: 62 },
      sourceGeometry: { width: 44, height: 62, angle: 0, scale: 1 },
      event: { id: "discard:room-a:game-a:4:0:0", tile: "p1*" },
    });
  });

  it("matches a riichi tsumogiri choice with both riichi and tsumogiri suffixes", () => {
    const tracker = new DiscardMotionTracker();
    const before = table({}, {
      drawnTile: "p1", hand: ["p2", "p1"],
      choices: [{ id: "riichi:p1_", type: "riichi", value: "p1_" }],
    });
    tracker.observe(before, { canAnimate: false });
    const next = table({ version: 11 }, { decisionId: "opaque-decision-b", turnSeat: 1, drawnTile: null });
    next.game!.players[0].discards = ["p1_*"];

    const result = tracker.observe(next, {
      canAnimate: true,
      intent: intent({ choiceId: "riichi:p1_", tileValue: "p1_", sourceTileId: "drawn:opaque-decision-a:p1" }),
    });

    expect(result.flight).toMatchObject({ source: "own", event: { tile: "p1_*" }, sourceTileId: "drawn:opaque-decision-a:p1" });
  });

  it("does not animate a local discard when the accepted event no longer matches its decision, hand or choice", () => {
    const cases = [
      intent({ decisionId: "an-old-decision" }),
      intent({ handId: 3 }),
      intent({ gameInstanceId: "another-game" }),
      intent({ choiceId: "discard:p2" }),
    ];

    for (const pending of cases) {
      const tracker = new DiscardMotionTracker();
      tracker.observe(table(), { canAnimate: false });
      const next = table({ version: 11 }, { decisionId: "opaque-decision-b" });
      next.game!.players[0].discards = ["p1"];
      expect(tracker.observe(next, { canAnimate: true, intent: pending }).flight).toBeNull();
    }
  });

  it("reports a claimed river event as cancelled without inventing a new discard", () => {
    const tracker = new DiscardMotionTracker();
    const before = table();
    before.game!.players[1].discards = ["m3"];
    tracker.observe(before, { canAnimate: false });

    const after = table({ version: 11 }, { decisionId: "opaque-decision-b" });
    after.game!.players[1].discards = ["m3+"];
    const result = tracker.observe(after, { canAnimate: true });

    expect(result.newEvents).toEqual([]);
    expect(result.cancelledEventIds).toEqual(["discard:room-a:game-a:4:1:0"]);
    expect(result.flight).toBeNull();
  });

  it("recognizes a claimed riichi tsumogiri with the additional call suffix", () => {
    const tracker = new DiscardMotionTracker();
    const before = table();
    before.game!.players[1].discards = ["m3_*"];
    tracker.observe(before, { canAnimate: false });
    const after = table({ version: 11 }, { decisionId: "opaque-decision-b" });
    after.game!.players[1].discards = ["m3_*+"];

    const result = tracker.observe(after, { canAnimate: true });

    expect(result.newEvents).toEqual([]);
    expect(result.cancelledEventIds).toEqual(["discard:room-a:game-a:4:1:0"]);
  });

  it("silently applies a version gap or multiple unseen discards instead of guessing their order", () => {
    const gapTracker = new DiscardMotionTracker();
    gapTracker.observe(table(), { canAnimate: false });
    const gap = table({ version: 12 }, { decisionId: "opaque-decision-c" });
    gap.game!.players[1].discards = ["m2"];
    expect(gapTracker.observe(gap, { canAnimate: true }).flight).toBeNull();

    const burstTracker = new DiscardMotionTracker();
    burstTracker.observe(table(), { canAnimate: false });
    const burst = table({ version: 11 }, { decisionId: "opaque-decision-b" });
    burst.game!.players[0].discards = ["p1"];
    burst.game!.players[2].discards = ["s9"];
    expect(burstTracker.observe(burst, { canAnimate: true, intent: intent() }).flight).toBeNull();
  });

  it("resets silently at a new room, game, hand or identity-less legacy snapshot", () => {
    const tracker = new DiscardMotionTracker();
    tracker.observe(table(), { canAnimate: false });
    const nextHand = table({ version: 20 }, { gameInstanceId: "game-b", handId: 1, decisionId: "opaque-decision-z" });
    nextHand.game!.players[2].discards = ["p6"];
    expect(tracker.observe(nextHand, { canAnimate: true }).newEvents).toEqual([]);

    const legacy = table({ version: 21 }, { gameInstanceId: undefined, handId: undefined });
    legacy.game!.players[1].discards = ["s1"];
    expect(tracker.observe(legacy, { canAnimate: true }).flight).toBeNull();
  });
});
