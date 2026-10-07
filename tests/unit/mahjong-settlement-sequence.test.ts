import { randomUUID } from "node:crypto";
import Majiang from "@kobalab/majiang-core";
import { describe, expect, it } from "vitest";
import { RiichiGame } from "@/modules/mahjong/engine";
import { SanmaGame } from "@/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "@/modules/mahjong/sanma-wall";
import { RoomStore } from "@/modules/mahjong/rooms";
import type { Choice, GameVariant, GameView, MahjongCommand } from "@/modules/mahjong/types";

type Flow = { id: string; stage: "detail" | "scores"; detailIndex: number; detailCount: number; elapsedMs: number; oldScores: number[]; delta: number[]; newScores: number[] };
type PresentedView = GameView & { settlementFlow?: Flow };
const tiles = (hand: string) => [...hand.matchAll(/([mpsz])(\d+)/g)].flatMap(m => [...m[2]].map(n => m[1] + n));

function physicalEngine(variant: GameVariant, hands: Record<number, string>, draw: string) {
  if (variant === "sanma") return new SanmaGame("east", ["A", "B", "C"], { dealer: 0, wallFactory: () => {
    const available = sanmaTiles();
    const take = (tile: string) => { const i = available.indexOf(tile); if (i < 0) throw Error(`Impossible tile ${tile}`); return available.splice(i, 1)[0]; };
    const dealt = [0, 1, 2].map(s => hands[s] ? tiles(hands[s]).map(take) : []), drawn = take(draw);
    for (const hand of dealt) if (!hand.length) hand.push(...available.splice(0, 13));
    return new SanmaWall([...dealt.flat(), drawn, ...available.splice(0, 54), ...available.splice(0, 4), ...available.splice(0, 10)]);
  }});
  return new RiichiGame("east", ["A", "B", "C", "D"], { dealer: 0, wallFactory: rule => {
    const wall = new Majiang.Shan(rule), available = wall._pai.slice();
    const take = (tile: string) => { const i = available.indexOf(tile); if (i < 0) throw Error(`Impossible tile ${tile}`); return available.splice(i, 1)[0]; };
    const dealt = [0, 1, 2, 3].map(s => hands[s] ? tiles(hands[s]).map(take) : []), drawn = take(draw);
    // Reserve real copies before random filler hands: z6 indicators yield z7,
    // absent from the double-ron winning hands, so the literal payment is fixed.
    const dora = take("z6"), ura = take("z6");
    for (const hand of dealt) if (!hand.length) hand.push(...available.splice(0, 13));
    wall._pai = [...available.slice(0, 4), dora, ...available.slice(4, 8), ura, ...available.slice(8), ...[...dealt, [drawn]].flat().reverse()];
    wall._baopai = [wall._pai[4]]; wall._fubaopai = [wall._pai[9]];
    return wall;
  }});
}

function table(variant: GameVariant, engine: RiichiGame | SanmaGame) {
  let now = 1000;
  const count = variant === "sanma" ? 3 : 4;
  const players = Array.from({ length: count }, (_, s) => ({ userId: randomUUID(), displayName: `玩家${s}` }));
  const store = new RoomStore({ now: () => now, gameFactory: () => engine });
  const send = (seat: number, input: object) => store.execute(players[seat], { ...input, nonce: randomUUID() } as MahjongCommand)!;
  const room = send(0, { action: "create", variant, mode: "east" });
  for (let s = 1; s < count; s++) send(s, { action: "join", code: room.code });
  for (let s = 0; s < count; s++) send(s, { action: "ready", ready: true, roomId: room.id });
  send(0, { action: "start", roomId: room.id });
  const view = (seat = 0) => store.view(players[seat].userId)!.game! as PresentedView;
  const choose = (seat: number, type: Choice["type"], value?: string) => {
    const v = view(seat), c = v.choices.find(c => c.type === type && (value === undefined || c.value === value));
    expect(c, `real legal ${type} for seat ${seat}`).toBeDefined();
    return send(seat, { action: "respond", roomId: room.id, decisionId: v.decisionId, choiceId: c!.id });
  };
  const ackAll = () => { for (let s = 0; s < count; s++) choose(s, "ack"); };
  return { count, room, store, players, send, view, choose, ackAll, advanceClock: (ms: number) => { now += ms; } };
}

describe("authoritative whole-hand result sequence", () => {
  it.each(["sanma", "yonma"] as const)("shows two real %s ron details before one net score stage", variant => {
    const raw = physicalEngine(variant, { 1: "p123456789s123z2", 2: "p123456789s123z2" }, "z2");
    const t = table(variant, raw);
    const oldScores = t.view().players.slice().sort((a, b) => a.seat - b.seat).map(p => p.score);
    const handId = t.view().handId;
    t.choose(0, "discard", "z2_");
    const endingHands = Array.from({ length: t.count }, (_, seat) => t.view(seat).hand.slice());
    t.choose(1, "ron"); t.choose(2, "ron");
    const first = t.view();
    expect(first.settlementFlow?.stage).toBe("detail");
    expect(first.settlementFlow?.detailCount).toBe(2);
    expect(first.settlement?.winnerSeat).toBe(1);
    expect(first.players.map(p => p.score)).toEqual(oldScores);
    expect(first.handId).toBe(handId);
    for (let seat = 0; seat < t.count; seat++) expect(t.view(seat).hand).toEqual(endingHands[seat]);
    t.ackAll();
    const second = t.view();
    expect(second.settlementFlow?.detailIndex).toBe(1);
    expect(second.settlement?.winnerSeat).toBe(2);
    expect(second.players.map(p => p.score)).toEqual(oldScores);
    expect(second.handId).toBe(handId);
    t.ackAll();
    const scores = t.view();
    expect(scores.settlementFlow?.stage).toBe("scores");
    expect(scores.settlementFlow?.delta).toEqual(variant === "sanma" ? [-5200, 2600, 2600] : [-5200, 2600, 2600, 0]);
    const expected = oldScores.map((score, seat) => score + scores.settlementFlow!.delta[seat]);
    expect(scores.settlementFlow?.newScores).toEqual(expected);
    expect(scores.players.map(p => p.score)).toEqual(oldScores);
    expect(scores.ranking).toBeNull();
    for (let seat = 0; seat < t.count; seat++) expect(t.view(seat).hand).toEqual(endingHands[seat]);
    t.ackAll();
    expect(t.view().handId).toBe(handId! + 1);
    expect(t.view().players.slice().sort((a, b) => a.seat - b.seat).map(p => p.score)).toEqual(expected);
    expect(t.view().settlementFlow).toBeUndefined();
  });

  it.each(["sanma", "yonma"] as const)("presents one real %s tsumo then one score stage without altering native totals", variant => {
    const raw = physicalEngine(variant, { 0: "p123456789s123z2" }, "z2"), t = table(variant, raw);
    t.choose(0, "tsumo");
    const result = t.view();
    expect(result.settlement?.winMethod).toBe("tsumo");
    expect(result.settlementFlow?.stage).toBe("detail");
    expect(result.settlementFlow?.detailCount).toBe(1);
    expect(result.settlementFlow?.delta).toEqual(result.settlement?.delta);
    t.ackAll();
    expect(t.view().settlementFlow?.stage).toBe("scores");
    const expected = t.view().settlementFlow!.newScores;
    expect(raw.view(0).players.slice().sort((a, b) => a.seat - b.seat).map(p => p.score)).toEqual(expected);
    t.ackAll();
    expect(t.view().players.slice().sort((a, b) => a.seat - b.seat).map(p => p.score)).toEqual(expected);
  });

  it("rejects duplicate and former-stage ACKs and isolates returned snapshots", () => {
    const t = table("sanma", physicalEngine("sanma", { 1: "p123456789s123z2", 2: "p123456789s123z2" }, "z2"));
    t.choose(0, "discard", "z2_"); t.choose(1, "ron"); t.choose(2, "ron");
    const before = t.view();
    t.choose(0, "ack");
    expect(() => t.send(0, { action: "respond", roomId: t.room.id, decisionId: before.decisionId, choiceId: "ack" })).toThrow();
    expect(t.view().choices).toEqual([]);
    t.choose(1, "ack"); t.choose(2, "ack");
    expect(t.view().decisionId).not.toBe(before.decisionId);
    expect(() => t.send(1, { action: "respond", roomId: t.room.id, decisionId: before.decisionId, choiceId: "ack" })).toThrow();
    const returned = t.view(1);
    expect(returned.settlementFlow).toBeDefined();
    returned.hand.splice(0); returned.settlementFlow!.delta[0] = 999999;
    expect(t.view(1).hand.length).toBeGreaterThan(0);
    expect(t.view().settlementFlow?.delta[0]).toBe(-5200);
    t.advanceClock(1500);
    expect(t.view().settlementFlow?.elapsedMs).toBe(1500);
    t.store.connection(t.players[1].userId, 1); t.store.connection(t.players[1].userId, -1); t.store.connection(t.players[1].userId, 1);
    expect(t.view(1).decisionId).toBe(t.view().decisionId);
    expect(t.view(1).settlementFlow?.detailIndex).toBe(1);
  });

  it("withholds final ranking until the genuine negative-balance win finishes its score stage", () => {
    const t = table("yonma", physicalEngine("yonma", { 0: "z1112223334445" }, "z5"));
    t.choose(0, "tsumo");
    expect(t.view().settlementFlow?.detailCount).toBe(1);
    expect(t.store.view(t.players[0].userId)!.status).toBe("playing");
    t.ackAll();
    const flow = t.view().settlementFlow!;
    expect(flow.stage).toBe("scores");
    expect(flow.newScores.some(s => s < 0)).toBe(true);
    expect(t.view().ranking).toBeNull();
    t.ackAll();
    expect(t.store.view(t.players[0].userId)!.status).toBe("finished");
    expect(t.view().ranking?.map(p => p.score)).toEqual(flow.newScores.slice().sort((a, b) => b - a));
  });
});
