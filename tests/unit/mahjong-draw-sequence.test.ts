import { describe, expect, it, vi } from "vitest";
import { SettlementSequenceGame } from "@/modules/mahjong/settlement-sequence";
import { RiichiGame } from "@/modules/mahjong/engine";
import type { GameView } from "@/modules/mahjong/types";
import { drawEngine, playToDraw } from "../fixtures/mahjong-draw-game";
import { physicalEngine } from "../fixtures/mahjong-settlement-game";

const info = (v: GameView) => v.settlement?.drawInfo;
const stage = (v: GameView) => v.settlementFlow?.stage as string | undefined;
function ack(game: SettlementSequenceGame, seat: number) { const view=game.view(seat); const choice=view.choices.find(c=>c.type==="ack"); expect(choice).toBeDefined(); game.respond(seat,view.decisionId,choice!.id); }
const balances = (v: GameView) => v.players.slice().sort((a,b)=>a.seat-b.seat).map(p=>p.score);

describe("native draw result presentation", () => {
  it("yonma public tenpai waits retain a real called meld", () => {
    const raw = physicalEngine("yonma", {0: "p123456789z2233", 1: "m19p147s258z13566"}, "m2");
    const game = new SettlementSequenceGame(raw, 4);
    const choose = (seat: number, type: string, value?: string) => {
      const view = game.view(seat), choice = view.choices.find(c => c.type === type && (value === undefined || c.value === value));
      expect(choice, `${seat} ${type} ${value ?? ""}`).toBeDefined();
      game.respond(seat, view.decisionId, choice!.id);
    };
    choose(0, "discard", "m2_");
    // Resolve any real claims before the next player draws.
    for (let seat = 1; seat < 4; seat++) if (game.view(seat).choices.some(c => c.type === "pass")) choose(seat, "pass");
    choose(1, "discard", "z3");
    choose(0, "pon");
    for (let seat = 2; seat < 4; seat++) if (game.view(seat).choices.some(c => c.type === "pass")) choose(seat, "pass");
    choose(0, "discard", "z2");
    expect(game.view(0).players.find(p => p.seat === 0)?.melds).toHaveLength(1);
    playToDraw(game, 4);
    const hand = info(game.view(0))?.revealedHands.find(h => h.seat === 0);
    expect(hand?.hand).toContain(",z333");
    expect(hand?.waits).toEqual(["z2"]);
  });
  for (const seat of [1, 2, 3]) it(`yonma rejects a native nagashi partition mismatch at payer ${seat}`, () => {
    const raw = drawEngine("yonma", [0]);
    expect(raw).toBeInstanceOf(RiichiGame);
    if (!(raw instanceof RiichiGame)) throw Error("Expected native yonma");
    const original = raw.call_players.bind(raw);
    vi.spyOn(raw, "call_players").mockImplementation((type, messages) => {
      if (type === "pingju") {
        messages = structuredClone(messages);
        for (const message of messages) (message as {pingju:{fenpei:number[]}}).pingju.fenpei[seat]++;
      }
      original(type, messages);
    });
    expect(() => playToDraw(raw, 4)).toThrow("Native nagashi partition mismatch");
  });
  for (const variant of ["sanma","yonma"] as const) {
    const count=variant==="sanma"?3:4;
    it(`${variant} zero-payment exhaustive draws retain their score page and final ranking barrier`, () => {
      const raw = drawEngine(variant, [], {hands: ["m19p369s369z14577", "m19p147s258z13566", "m19p258s147z23477", "m2346p3468s2468z3"]});
      const game = new SettlementSequenceGame(raw, count), old = balances(game.view(0));
      for (let hand = 0; hand < count; hand++) {
        playToDraw(game, count);
        const ending = game.view(0);
        expect(info(ending)?.kind).toBe("exhaustive");
        expect(info(ending)?.revealedHands).toEqual([]);
        expect(ending.settlement?.tenpaiSeats).toEqual([]);
        for (let seat = 0; seat < count; seat++) ack(game, seat);
        expect(stage(game.view(0))).toBe("scores");
        expect(game.view(0).settlementFlow?.delta).toEqual(Array(count).fill(0));
        for (let seat = 0; seat < count - 1; seat++) ack(game, seat);
        expect(game.view(0).ranking).toBeNull();
        expect(game.view(0).handId).toBe(ending.handId);
        ack(game, count - 1);
      }
      expect(game.view(0).ranking?.map(p => p.score)).toEqual(old);
      expect(game.view(0).settlementFlow).toBeUndefined();
    });
    it(`${variant} exhaustive draw shows only public tenpai hands then one score page`, () => {
      const raw=drawEngine(variant), game=new SettlementSequenceGame(raw,count);
      const old=balances(game.view(0)); playToDraw(game,count);
      const first=game.view(0), handId=first.handId;
      expect(first.settlement?.name).toBe("荒牌平局");
      expect(info(first)?.kind).toBe("exhaustive"); expect(stage(first)).toBe("draw");
      expect(info(first)?.revealedHands).toEqual([{seat:0,hand:"p123456789s123z2",waits:["z2"]}]);
      expect(first.settlement?.tenpaiSeats).toEqual([0]); expect(balances(first)).toEqual(old);
      const saved=game.view(1); info(saved)!.revealedHands[0].hand="z777";
      expect(info(game.view(1))!.revealedHands[0].hand).toBe("p123456789s123z2");
      ack(game,0); expect(stage(game.view(0))).toBe("scores"); expect(stage(game.view(1))).toBe("draw");
      expect(()=>game.respond(0,first.decisionId,"ack")).toThrow();
      const delta=variant==="sanma"?[3000,-1500,-1500]:[3000,-1000,-1000,-1000];
      expect(game.view(0).settlementFlow?.delta).toEqual(delta);
      ack(game,0); expect(game.view(0).choices).toEqual([]); expect(game.view(0).handId).toBe(handId);
      expect(game.view(0).ranking).toBeNull();
      for(let seat=1;seat<count;seat++){ack(game,seat);ack(game,seat);}
      expect(game.view(0).handId).toBe(handId!+1); expect(balances(game.view(0))).toEqual(old.map((s,i)=>s+delta[i]));
      expect(game.view(0).settlementFlow).toBeUndefined();
    });
    it(`${variant} nine-terminals abort reveals its declarer without a fake score page`, () => {
      const raw=physicalEngine(variant,{0:"m19p19s19z1234567"},"z1"), game=new SettlementSequenceGame(raw,count);
      const view=game.view(0), abort=view.choices.find(c=>c.type==="abort"); expect(abort).toBeDefined();
      game.respond(0,view.decisionId,abort!.id);const ending=game.view(0);
      expect(info(ending)?.kind).toBe("abort");expect(stage(ending)).toBe("draw");expect(ending.settlement?.tenpaiSeats).toEqual([]);
      expect(info(ending)?.revealedHands.map(h=>h.seat)).toEqual([0]);
      expect(info(ending)?.revealedHands[0].waits).toEqual([]);
      ack(game,0);expect(stage(game.view(0))).toBe("draw");expect(game.view(0).choices).toEqual([]);
      for(let seat=1;seat<count;seat++)ack(game,seat);
      expect(game.view(0).handId).toBe(ending.handId!+1);expect(game.view(0).honba).toBe(1);expect(game.view(0).roundNumber).toBe(1);
    });
    for(const winners of [[0],[0,1]])it(`${variant} ${winners.length} natural nagashi winners have detail pages and one exact net delta`, () => {
      const raw=drawEngine(variant,winners), game=new SettlementSequenceGame(raw,count),old=balances(game.view(0));
      playToDraw(game,count);const first=game.view(0);
      expect(first.settlement?.name).toBe("流し満貫");expect(info(first)?.kind).toBe("nagashi");expect(stage(first)).toBe("draw");
      const results=info(first)!.nagashiResults;
      expect(results.map(r=>r.seat)).toEqual(winners);expect(results.map(r=>r.points)).toEqual(variant==="sanma"?winners.map(s=>s===0?8000:6000):winners.map(s=>s===0?12000:8000));
      const nativeDelta=first.settlement!.delta.slice();
      expect(Array.from({length:count},(_,s)=>results.reduce((n,r)=>n+r.delta[s],0))).toEqual(nativeDelta);
      ack(game,0);
      for(let i=0;i<winners.length;i++){
        const page=game.view(0);expect(stage(page)).toBe("detail");expect(page.settlement?.winnerSeat).toBe(winners[i]);
        expect(page.settlement?.points).toBe(results[i].points);expect(page.settlement?.delta).toEqual(results[i].delta);
        expect(page.settlementFlow?.detailIndex).toBe(i); expect(balances(page)).toEqual(old);ack(game,0);
      }
      expect(stage(game.view(0))).toBe("scores");expect(game.view(0).settlementFlow?.delta).toEqual(nativeDelta);ack(game,0);
      expect(stage(game.view(1))).toBe("draw");expect(game.view(0).handId).toBe(first.handId);
      for(let seat=1;seat<count;seat++)for(let n=0;n<winners.length+2;n++)ack(game,seat);
      expect(balances(game.view(0))).toEqual(old.map((n,i)=>n+nativeDelta[i]));expect(game.view(0).handId).toBe(first.handId!+1);
    });
  }
});
