import assert from "node:assert/strict";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { GameVariant } from "../../src/modules/mahjong/types";
const tiles = (hand: string) => [...hand.matchAll(/([mpsz])(\d+)/g)].flatMap(m => [...m[2]].map(n => m[1] + n));

export function abortPhysicalEngine(variant: GameVariant, hands: Record<number, string>, draw: string, dealer = 0) {
  if (variant === "sanma") return new SanmaGame("east", ["A", "B", "C"], { dealer, wallFactory: () => {
    const available = sanmaTiles();
    const take = (tile: string) => { const i = available.indexOf(tile); if (i < 0) throw Error(`Impossible tile ${tile}`); return available.splice(i, 1)[0]; };
    const dealt = [0, 1, 2].map(s => hands[s] ? tiles(hands[s]).map(take) : []), drawn = take(draw);
    for (const hand of dealt) { if (!hand.length) hand.push(...available.splice(0, 13)); assert.equal(hand.length, 13, "Each wind receives 13 real tiles"); }
    return new SanmaWall([...dealt.flat(), drawn, ...available.splice(0, 54), ...available.splice(0, 4), ...available.splice(0, 10)]);
  }});
  return new RiichiGame("east", ["A", "B", "C", "D"], { dealer, wallFactory: rule => {
    const wall = new Majiang.Shan(rule), physical = wall._pai.slice(), available = physical.slice();
    const take = (tile: string) => { const i = available.indexOf(tile); if (i < 0) throw Error(`Impossible tile ${tile}`); return available.splice(i, 1)[0]; };
    const dealt = [0, 1, 2, 3].map(s => hands[s] ? tiles(hands[s]).map(take) : []), drawn = take(draw);
    // Reserve physical indicator copies before filling unspecified wind hands.
    const dora = take("z6"), ura = take("z6");
    for (const hand of dealt) { if (!hand.length) hand.push(...available.splice(0, 13)); assert.equal(hand.length, 13, "Each wind receives 13 real tiles"); }
    wall._pai = [...available.slice(0, 4), dora, ...available.slice(4, 8), ura, ...available.slice(8), ...[...dealt, [drawn]].flat().reverse()];
    assert.deepEqual(wall._pai.slice().sort(), physical.sort(), "Fixture conserves all 136 physical tiles");
    wall._baopai = [wall._pai[4]]; wall._fubaopai = [wall._pai[9]];
    return wall;
  }});
}


export type AbortKind = "nine" | "winds" | "riichi" | "ron" | "kans";
export function abortEngine(kind: AbortKind, variant: GameVariant = "yonma", dealer = 0, declareRiichi = false) {
  if (variant === "sanma" && ["winds", "riichi", "ron"].includes(kind)) throw Error("Four-seat abort requires yonma");
  const ronHands:Record<number,string>={1:"p123456789s123z3",2:"m123456789s456z3",3:"p111s222333444z3"};
  if (declareRiichi) ronHands[0]="m123456789z1112";
  const hands: Record<number, string> = kind === "nine" ? {0:"m19p19s19z1234567"}
    : kind === "winds" ? {0:"m19p147s258z13567",1:"m19p258s147z12367",2:"m19p369s369z12457",3:"m2346p3468s2468z1"}
    : kind === "riichi" ? {0:"m123456789p111z1",1:"p123456789s111z2",2:"s123456789m111z3",3:"m222333p222333z4"}
    : kind === "ron" ? ronHands
    : variant === "sanma" ? {0:"p1111s1111z2222z3",1:"p2222s234567z111"} : {0:"m1111p1111s1111z1",1:"m2222p234s234z111"};
  return abortPhysicalEngine(variant, hands, kind === "nine" ? "z1" : kind === "winds" ? "z4" : kind === "riichi" ? "z5" : kind === "ron" ? "z3" : "p9", dealer);
}

/** Only legal public choices advance the full native wall; no result injection. */
export function playAbort(game: import("../../src/modules/mahjong/types").MahjongGame, kind: AbortKind, dealer = 0, declareRiichi = false) {
  const count = game.view(0).players.length;
  const seat = (wind: number) => (dealer + wind) % count;
  const choose = (actor: number, type: string, value?: string) => {
    const v = game.view(actor), c = v.choices.find(c => c.type === type && (value === undefined || c.value === value));
    assert.ok(c, `${actor} ${type} ${value ?? ""}: ${JSON.stringify(v.choices)}`);
    game.respond(actor, v.decisionId, c.id);
  };
  const pass = () => {
    for (let n = 0; n < 20; n++) {
      const actor = game.view(0).players.find(p => game.view(p.seat).choices.some(c => c.type === "pass"))?.seat;
      if (actor === undefined) return;
      choose(actor, "pass");
    }
    throw Error("Abort fixture reaction exceeded bound");
  };
  const discardDrawn = (actor: number) => {const c = game.view(actor).choices.find(c => c.type === "discard" && c.value?.endsWith("_")); assert.ok(c); choose(actor, "discard", c.value); pass();};
  if (kind === "nine") choose(dealer, "abort");
  else if (kind === "winds") for (let wind = 0; wind < 4; wind++) {choose(seat(wind), "discard", "z1"); pass();}
  else if (kind === "riichi") for (let wind = 0; wind < 4; wind++) {choose(seat(wind), "riichi"); pass();}
  else if (kind === "ron") {
    choose(dealer, declareRiichi ? "riichi" : "discard", "z3_");
    for (let wind = 1; wind < 4; wind++) choose(seat(wind), "ron");
  } else {
    for (const value of count === 3 ? ["p1111", "s1111", "z2222"] : ["m1111", "p1111", "s1111"]) {choose(dealer, "kan", value); pass();}
    discardDrawn(dealer); choose(seat(1), "kan", count === 3 ? "p2222" : "m2222"); pass();
    if (declareRiichi) {choose(seat(1), "riichi"); pass();} else discardDrawn(seat(1));
  }
  assert.equal(game.view(0).settlement?.drawInfo?.kind, "abort");
}
