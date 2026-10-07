import { describe, expect, it } from "vitest";
import {
  isAcceptedOwnHandDiscard,
  matchHandReflowOccurrences,
  type HandReflowTile,
} from "@/components/mahjong/hand-reflow";
import type { DiscardMotionIntent } from "@/components/mahjong/discard-motion";
import type { RoomView } from "@/modules/mahjong/types";

const intent = (overrides: Partial<DiscardMotionIntent> = {}): DiscardMotionIntent => ({
  roomId: "room-a", roomVersion: 10, gameInstanceId: "game-a", handId: 4,
  decisionId: "decision-a", seat: 0, choiceId: "discard:p5", tileValue: "p5",
  sourceTileId: "hand:1:p5", sourceRect: { left: 100, top: 200, width: 40, height: 60 },
  sourceGeometry: { width: 40, height: 60, angle: 0, scale: 1 }, environmentEpoch: 0,
  ...overrides,
});

function room(options: {
  id?: string; version?: number; gameInstanceId?: string; handId?: number; decisionId?: string;
  choices?: Array<{ id: string; type: string; value?: string }>; ownDiscards?: string[]; otherDiscards?: string[];
} = {}): RoomView {
  return {
    id: options.id ?? "room-a", code: "ABCDEFGH", hostUserId: "user-0", mode: "east", variant: "yonma",
    status: "playing", version: options.version ?? 10, mySeat: 0,
    members: [],
    game: {
      gameInstanceId: options.gameInstanceId ?? "game-a", handId: options.handId ?? 4,
      decisionId: options.decisionId ?? "decision-a", choices: options.choices ?? [{ id: "discard:p5", type: "discard", value: "p5" }],
      players: [{ seat: 0, discards: options.ownDiscards ?? [] }, { seat: 1, discards: options.otherDiscards ?? [] }],
    } as RoomView["game"],
  } as RoomView;
}

const tile = (instanceId: string, face: string, x: number): HandReflowTile => ({
  instanceId, face, rect: { x, y: 100, width: 40, height: 60 },
});

describe("matchHandReflowOccurrences", () => {
  it("keeps red five, duplicate copies, and the drawn physical copy attached to their old instances", () => {
    const source = [
      tile("hand:0:p0", "p0", 0),
      tile("hand:1:p5", "p5", 50),
      tile("hand:2:p5", "p5", 100),
      tile("drawn:decision-a:p5", "p5", 600),
    ];
    const target = [tile("hand:0:p0", "p0", 0), tile("hand:1:p5", "p5", 50), tile("hand:2:p5", "p5", 100)];

    expect(matchHandReflowOccurrences(source, target, "hand:1:p5")).toEqual([
      { sourceInstanceId: "hand:0:p0", targetInstanceId: "hand:0:p0", face: "p0", from: source[0].rect, to: target[0].rect },
      { sourceInstanceId: "hand:2:p5", targetInstanceId: "hand:1:p5", face: "p5", from: source[2].rect, to: target[1].rect },
      { sourceInstanceId: "drawn:decision-a:p5", targetInstanceId: "hand:2:p5", face: "p5", from: source[3].rect, to: target[2].rect },
    ]);
  });

  it("does not guess when the discarded occurrence is absent or target face counts do not match", () => {
    const source = [tile("hand:0:p1", "p1", 0), tile("drawn:decision-a:p2", "p2", 100)];
    expect(matchHandReflowOccurrences(source, [tile("hand:0:p1", "p1", 0)], "hand:8:p9")).toEqual([]);
    expect(matchHandReflowOccurrences(source, [tile("hand:0:p1", "p1", 0), tile("hand:1:p3", "p3", 50)], "hand:0:p1")).toEqual([]);
  });
});

describe("isAcceptedOwnHandDiscard", () => {
  it("accepts one consecutive matching normal discard from the same own decision", () => {
    const before = room();
    const after = room({ version: 11, decisionId: "decision-b", ownDiscards: ["p5"] });
    expect(isAcceptedOwnHandDiscard(before, after, intent())).toBe(true);
  });

  it("accepts a matching riichi event while retaining the selected physical occurrence", () => {
    const before = room({ choices: [{ id: "riichi:z1", type: "riichi", value: "z1" }] });
    const after = room({ version: 11, decisionId: "decision-b", ownDiscards: ["z1*"] });
    expect(isAcceptedOwnHandDiscard(before, after, intent({ choiceId: "riichi:z1", tileValue: "z1", sourceTileId: "hand:10:z1" }))).toBe(true);
  });

  it("rejects initial snapshots, quiet updates, unrelated seats, version gaps, stale choices, and scope changes", () => {
    const before = room();
    const pending = intent();
    expect(isAcceptedOwnHandDiscard(null, room({ version: 11, decisionId: "decision-b", ownDiscards: ["p5"] }), pending)).toBe(false);
    expect(isAcceptedOwnHandDiscard(before, room(), pending)).toBe(false);
    expect(isAcceptedOwnHandDiscard(before, room({ version: 11, decisionId: "decision-b", otherDiscards: ["p5"] }), pending)).toBe(false);
    expect(isAcceptedOwnHandDiscard(before, room({ version: 12, decisionId: "decision-b", ownDiscards: ["p5"] }), pending)).toBe(false);
    expect(isAcceptedOwnHandDiscard(before, room({ id: "room-b", version: 11, decisionId: "decision-b", ownDiscards: ["p5"] }), pending)).toBe(false);
    expect(isAcceptedOwnHandDiscard(before, room({ version: 11, decisionId: "decision-b", ownDiscards: ["p2"] }), pending)).toBe(false);
    expect(isAcceptedOwnHandDiscard(before, room({ version: 11, decisionId: "decision-b", ownDiscards: ["p5"] }), intent({ choiceId: "discard:p2" }))).toBe(false);
    expect(isAcceptedOwnHandDiscard(before, room({ version: 11, decisionId: "decision-b", ownDiscards: ["p5"] }), intent({ handId: 3 }))).toBe(false);
  });

  it("accepts the physical discard even when an opponent claim marker is already visible", () => {
    const before = room();
    const claimed = room({ version: 11, decisionId: "decision-b", ownDiscards: ["p5+"] });
    expect(isAcceptedOwnHandDiscard(before, claimed, intent())).toBe(true);
  });
});
