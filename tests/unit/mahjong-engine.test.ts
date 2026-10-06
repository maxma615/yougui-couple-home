import { describe, expect, it } from "vitest";
import { RiichiGame } from "@/modules/mahjong/engine";
import Majiang from "@kobalab/majiang-core";

function fixture(hands: Record<number, string>, drawn: string, dealer = 0) {
  return { dealer, wallFactory: (rule: ConstructorParameters<typeof Majiang.Shan>[0]) => {
    const wall = new Majiang.Shan(rule), available = wall._pai.slice();
    const take = (tile: string) => { const i = available.indexOf(tile); if (i < 0) throw new Error("Impossible test tile"); available.splice(i,1); return tile; };
    const dealt: string[][] = [[],[],[],[]];
    for (const [seat, encoded] of Object.entries(hands)) {
      dealt[Number(seat)] = [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(m => [...m[2]].map(n => take(m[1]+n)));
      if (dealt[Number(seat)].length !== 13) throw new Error("Test hand must have 13 tiles");
    }
    take(drawn);
    for(let seat=0;seat<4;seat++) if(!dealt[seat].length) dealt[seat]=available.splice(0,13);
    const dealOrder = Array.from({ length: 4 }, (_, wind) => dealt[(dealer + wind) % 4]);
    wall._pai=[...available,...[...dealOrder.flat(),drawn].reverse()];
    wall._baopai=[wall._pai[4]]; wall._fubaopai=[wall._pai[9]];
    return wall;
  } };
}

describe("riichi authoritative game", () => {
  it("deals four real hands but never exposes another player's concealed tiles or the wall", () => {
    const game = new RiichiGame("east", ["A", "B", "C", "D"]);
    const views = [0, 1, 2, 3].map(seat => game.view(seat));
    expect(views.map(v => v.hand.length).sort()).toEqual([13, 13, 13, 14]);
    expect(views[0].remainingTiles).toBe(69);
    for (const v of views) {
      expect(v.players).toHaveLength(4);
      expect(Object.keys(v.players[0]).sort()).toEqual(["discards", "handCount", "melds", "riichi", "score", "seat", "wind"]);
      expect(JSON.stringify(v)).not.toContain('"_pai"');
      expect(v.players.map(p => p.score)).toEqual([25000, 25000, 25000, 25000]);
    }
  });
  it("rejects non-turn, fabricated and stale choices without advancing the game", () => {
    const game = new RiichiGame("east", ["A", "B", "C", "D"]);
    const view = game.view(0), actor = view.turnSeat, own = game.view(actor);
    expect(() => game.respond((actor + 1) % 4, own.decisionId, "discard:m1")).toThrow();
    expect(() => game.respond(actor, own.decisionId, "discard:z8")).toThrow();
    expect(game.view(actor)).toEqual(own);
    const choice = own.choices.find(c => c.type === "discard")!;
    game.respond(actor, own.decisionId, choice.id);
    expect(game.view(actor).players.find(p => p.seat === actor)!.discards).toHaveLength(1);
    expect(() => game.respond(actor, own.decisionId, choice.id)).toThrow();
  });
  it("plays a complete east round with real draws, furiten, call passes and settlements", () => {
    const game = new RiichiGame("east", ["A", "B", "C", "D"]);
    let settlements = 0;
    for (let steps = 0; steps < 4000; steps++) {
      if (game.view(0).ranking) break;
      let acted = false;
      for (let seat = 0; seat < 4; seat++) {
        const v = game.view(seat);
        const choice = v.choices.find(c => c.type === "pass") ?? v.choices.find(c => c.type === "discard") ?? v.choices.find(c => c.type === "ack");
        if (!choice) continue;
        if (choice.type === "ack" && seat === 0) settlements++;
        game.respond(seat, v.decisionId, choice.id);
        acted = true;
      }
      expect(acted).toBe(true);
    }
    const final = game.view(0);
    expect(final.ranking).toHaveLength(4);
    expect(settlements).toBeGreaterThanOrEqual(4);
    expect(final.players.reduce((sum, p) => sum + p.score, 0)).toBe(100000);
  });
  it("offers a real legal riichi discard and collects exactly one 1000-point deposit", () => {
    const game = new RiichiGame("east", ["A","B","C","D"],fixture({0:"m123p123s123z1112"},"p9"));
    const before=game.view(0), riichi=before.choices.find(c=>c.type==="riichi"&&c.value==="p9_")!;
    expect(riichi).toBeDefined();
    game.respond(0,before.decisionId,riichi.id);
    for(let seat=1;seat<4;seat++) {const v=game.view(seat), pass=v.choices.find(c=>c.type==="pass");if(pass)game.respond(seat,v.decisionId,pass.id);}
    const after=game.view(0);
    expect(after.players.find(p=>p.seat===0)!.riichi).toBe(true);
    expect(after.players.find(p=>p.seat===0)!.score).toBe(24000);
    expect(after.riichiSticks).toBe(1);
    expect(after.players.reduce((sum,p)=>sum+p.score,0)+1000*after.riichiSticks).toBe(100000);
  });
  it("maps real tsumo and riichi choices to the right player through every dealer rotation", () => {
    for (const dealer of [0, 1, 2, 3]) {
      const winning = new RiichiGame("east", ["A", "B", "C", "D"], fixture({ [dealer]: "m123p123s123z1112" }, "z2", dealer));
      const tsumoView = winning.view(dealer);
      expect(tsumoView.turnSeat).toBe(dealer);
      expect(tsumoView.choices.some(choice => choice.type === "tsumo")).toBe(true);
      for (const seat of [0, 1, 2, 3].filter(seat => seat !== dealer)) {
        expect(winning.view(seat).choices).toEqual([]);
      }
      winning.respond(dealer, tsumoView.decisionId, "tsumo");
      expect(winning.view(dealer).settlement?.winnerSeat).toBe(dealer);

      const declaring = new RiichiGame("east", ["A", "B", "C", "D"], fixture({ [dealer]: "m123p123s123z1112" }, "p9", dealer));
      const riichiView = declaring.view(dealer);
      expect(riichiView.choices.some(choice => choice.type === "riichi" && choice.value === "p9_")).toBe(true);
      declaring.respond(dealer, riichiView.decisionId, "riichi:p9_");
      for (const seat of [0, 1, 2, 3]) {
        const view = declaring.view(seat);
        const pass = view.choices.find(choice => choice.type === "pass");
        if (pass) declaring.respond(seat, view.decisionId, pass.id);
      }
      expect(declaring.view(dealer).players.find(player => player.seat === dealer)?.riichi).toBe(true);
      expect(declaring.view(dealer).riichiSticks).toBe(1);
    }
  });
  it("settles a dealer heavenly-hand tsumo using the actual core's yakuman scoring", () => {
    const game=new RiichiGame("east",["A","B","C","D"],fixture({0:"m123p123s123z1112"},"z2"));
    const v=game.view(0), tsumo=v.choices.find(c=>c.type==="tsumo")!;
    expect(tsumo).toBeDefined(); game.respond(0,v.decisionId,tsumo.id);
    const settlement=game.view(0).settlement!;
    expect(settlement.kind).toBe("win"); expect(settlement.points).toBe(48000);
    expect(settlement.delta).toEqual([48000,-16000,-16000,-16000]);
    expect(settlement.yaku.some(y=>y.name==="天和")).toBe(true);
    for(let seat=0;seat<4;seat++){const view=game.view(seat);game.respond(seat,view.decisionId,"ack");}
    expect(game.view(0).players.find(p=>p.seat===0)!.score).toBe(73000);
  });
  it("offers another player's ron after a discard and prioritizes the winning reply", () => {
    const game=new RiichiGame("east",["A","B","C","D"],fixture({1:"m123p123s123z1112"},"z2"));
    const first=game.view(0); game.respond(0,first.decisionId,"discard:z2_");
    const second=game.view(1); expect(second.choices.some(c=>c.type==="ron")).toBe(true);
    game.respond(1,second.decisionId,"ron");
    for(let seat=2;seat<4;seat++){const v=game.view(seat);if(v.choices.some(c=>c.type==="pass"))game.respond(seat,v.decisionId,"pass");}
    expect(game.view(1).settlement!.winnerSeat).toBe(1);
    expect(game.view(1).settlement!.delta.reduce((s,n)=>s+n,0)).toBe(0);
  });
  it("resolves an ankan with a replacement draw and another dora indicator", () => {
    const game=new RiichiGame("east",["A","B","C","D"],fixture({0:"m111234p456s789z1"},"m1"));
    const v=game.view(0); expect(v.choices.some(c=>c.id==="kan:m1111")).toBe(true);
    game.respond(0,v.decisionId,"kan:m1111");
    const after=game.view(0);
    expect(after.phase).toBe("gangzimo"); expect(after.doraIndicators).toHaveLength(2);
    expect(after.remainingTiles).toBe(68); expect(after.hand).toHaveLength(11);
    expect(after.players.find(p=>p.seat===0)!.melds).toEqual(["m1111"]);
  });
});
