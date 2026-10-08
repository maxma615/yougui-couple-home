import { describe, expect, it } from "vitest";
import { SettlementSequenceGame } from "@/modules/mahjong/settlement-sequence";
import type { Choice, MahjongGame } from "@/modules/mahjong/types";
import { physicalEngine } from "../fixtures/mahjong-settlement-game";
import { drawEngine, playToDraw } from "../fixtures/mahjong-draw-game";

function choose(game: MahjongGame, seat: number, type: Choice["type"], value?: string) {
  const view = game.view(seat);
  const choice = view.choices.find(c => c.type === type && (value === undefined || c.value === value));
  expect(choice, `native legal ${type} seat ${seat}`).toBeDefined();
  game.respond(seat, view.decisionId, choice!.id);
}

describe("public native winning declarations", () => {
  for (const variant of ["sanma", "yonma"] as const) {
    const count = variant === "sanma" ? 3 : 4;
    it(`${variant} exposes both ron seats immediately, without private result details`, () => {
      const game = new SettlementSequenceGame(physicalEngine(variant, {1: "p123456789s123z2", 2: "p123456789s123z2"}, "z2"), count);
      choose(game, 0, "discard", "z2_"); choose(game, 1, "ron"); choose(game, 2, "ron");
      const declarations = [{seat: 1, winMethod: "ron"}, {seat: 2, winMethod: "ron"}];
      for (let seat = 0; seat < count; seat++) {
        expect(game.view(seat).settlementFlow?.winDeclarations).toEqual(declarations);
        expect(game.view(seat).settlement?.winnerSeat).toBe(1);
      }
      const returned = game.view(0).settlementFlow!.winDeclarations!;
      returned[0].seat = 0; returned.push({seat: 0, winMethod: "tsumo"});
      expect(game.view(0).settlementFlow?.winDeclarations).toEqual(declarations);
      choose(game, 0, "ack");
      expect(game.view(0).settlement?.winnerSeat).toBe(2);
      expect(game.view(1).settlementFlow?.detailIndex).toBe(0);
      for (let seat = 0; seat < count; seat++) expect(game.view(seat).settlementFlow?.winDeclarations).toEqual(declarations);
      choose(game, 0, "ack"); choose(game, 0, "ack");
      expect(game.view(0).choices).toEqual([]);
      for (let seat = 1; seat < count; seat++) { choose(game, seat, "ack"); choose(game, seat, "ack"); choose(game, seat, "ack"); }
      expect(game.view(0).settlementFlow).toBeUndefined();
    });
    it(`${variant} distinguishes tsumo from a single ron`, () => {
      const tsumo = new SettlementSequenceGame(physicalEngine(variant, {0: "p123456789s123z2"}, "z2"), count);
      choose(tsumo, 0, "tsumo");
      for (let seat = 0; seat < count; seat++) expect(tsumo.view(seat).settlementFlow?.winDeclarations).toEqual([{seat: 0, winMethod: "tsumo"}]);
      const ron = new SettlementSequenceGame(physicalEngine(variant, {1: "p123456789s123z2", 2: "p123456789s123z2"}, "z2"), count);
      choose(ron, 0, "discard", "z2_"); choose(ron, 1, "ron"); choose(ron, 2, "pass");
      for (let seat = 0; seat < count; seat++) expect(ron.view(seat).settlementFlow?.winDeclarations).toEqual([{seat: 1, winMethod: "ron"}]);
    });
    it.each([{winners: []}, {winners: [1]}])(`${variant} draw/nagashi $winners never announces ron`, ({winners}) => {
      const game = new SettlementSequenceGame(drawEngine(variant, winners), count);
      playToDraw(game, count);
      for (let seat = 0; seat < count; seat++) expect(game.view(seat).settlementFlow?.winDeclarations).toBeUndefined();
    });
  }
});
