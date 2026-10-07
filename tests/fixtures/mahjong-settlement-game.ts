import assert from "node:assert/strict";
import Majiang from "@kobalab/majiang-core";
import { RiichiGame } from "../../src/modules/mahjong/engine";
import { SanmaGame } from "../../src/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { GameVariant } from "../../src/modules/mahjong/types";
const tiles = (hand: string) => [...hand.matchAll(/([mpsz])(\d+)/g)].flatMap(m => [...m[2]].map(n => m[1] + n));

export function physicalEngine(variant: GameVariant, hands: Record<number, string>, draw: string) {
  if (variant === "sanma") return new SanmaGame("east", ["A", "B", "C"], { dealer: 0, wallFactory: () => {
    const available = sanmaTiles();
    const take = (tile: string) => { const i = available.indexOf(tile); if (i < 0) throw Error(`Impossible tile ${tile}`); return available.splice(i, 1)[0]; };
    const dealt = [0, 1, 2].map(s => hands[s] ? tiles(hands[s]).map(take) : []), drawn = take(draw);
    for (const hand of dealt) if (!hand.length) hand.push(...available.splice(0, 13));
    return new SanmaWall([...dealt.flat(), drawn, ...available.splice(0, 54), ...available.splice(0, 4), ...available.splice(0, 10)]);
  }});
  return new RiichiGame("east", ["A", "B", "C", "D"], { dealer: 0, wallFactory: rule => {
    const wall = new Majiang.Shan(rule), physical = wall._pai.slice(), available = physical.slice();
    const take = (tile: string) => { const i = available.indexOf(tile); if (i < 0) throw Error(`Impossible tile ${tile}`); return available.splice(i, 1)[0]; };
    const dealt = [0, 1, 2, 3].map(s => hands[s] ? tiles(hands[s]).map(take) : []), drawn = take(draw);
    // Reserve real copies before random filler hands: z6 indicators yield z7,
    // absent from the double-ron winning hands, so the literal payment is fixed.
    const dora = take("z6"), ura = take("z6");
    for (const hand of dealt) if (!hand.length) hand.push(...available.splice(0, 13));
    wall._pai = [...available.slice(0, 4), dora, ...available.slice(4, 8), ura, ...available.slice(8), ...[...dealt, [drawn]].flat().reverse()];
    assert.deepEqual(wall._pai.slice().sort(), physical.sort(), "Fixture conserves all 136 physical tiles");
    wall._baopai = [wall._pai[4]]; wall._fubaopai = [wall._pai[9]];
    return wall;
  }});
}

