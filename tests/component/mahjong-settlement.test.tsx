// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import Majiang from "@kobalab/majiang-core";
import { GameRoom } from "@/components/mahjong/mahjong-client";
import { RiichiGame } from "@/modules/mahjong/engine";
import { SanmaGame } from "@/modules/mahjong/sanma";
import { SanmaWall, sanmaTiles } from "@/modules/mahjong/sanma-wall";
import type { GameView, RoomView } from "@/modules/mahjong/types";

const sanmaNames = ["甲", "乙", "丙"];
const riichiNames = ["甲", "乙", "丙", "丁"];
const tileList = (encoded: string) => [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(match => [...match[2]].map(rank => match[1] + rank));

afterEach(cleanup);

function sanmaWall(hands: Record<number, string>, draws: string[]) {
  const physical = sanmaTiles(), available = physical.slice();
  const take = (tile: string) => {
    const index = available.indexOf(tile);
    if (index < 0) throw new Error(`Impossible physical Sanma fixture tile: ${tile}`);
    return available.splice(index, 1)[0];
  };
  const dealt = Array.from({ length: 3 }, (_, seat) => hands[seat] ? tileList(hands[seat]).map(take) : []);
  const drawn = draws.map(take);
  for (const hand of dealt) if (!hand.length) hand.push(...available.splice(0, 13));
  expect(dealt.map(hand => hand.length)).toEqual([13, 13, 13]);
  const reserve = available.splice(0, 4), indicators = available.splice(0, 10);
  const ordered = [...dealt.flat(), ...drawn, ...available, ...reserve, ...indicators];
  expect(ordered.slice().sort()).toEqual(physical.slice().sort());
  return new SanmaWall(ordered);
}

function riichiWall(hands: Record<number, string>, drawn: string) {
  return { dealer: 0, wallFactory: (rule: ConstructorParameters<typeof Majiang.Shan>[0]) => {
    const wall = new Majiang.Shan(rule), physical = wall._pai.slice(), available = wall._pai.slice();
    const take = (tile: string) => {
      const index = available.indexOf(tile);
      if (index < 0) throw new Error(`Impossible physical Riichi fixture tile: ${tile}`);
      return available.splice(index, 1)[0];
    };
    const dealt = Array.from({ length: 4 }, (_, seat) => hands[seat] ? tileList(hands[seat]).map(take) : []);
    const draw = take(drawn);
    for (const hand of dealt) if (!hand.length) hand.push(...available.splice(0, 13));
    expect(dealt.map(hand => hand.length)).toEqual([13, 13, 13, 13]);
    const orderedDeal = dealt.flat();
    wall._pai = [...available, ...[...orderedDeal, draw].reverse()];
    expect(wall._pai.slice().sort()).toEqual(physical.slice().sort());
    wall._baopai = [wall._pai[4]];
    wall._fubaopai = [wall._pai[9]];
    return wall;
  } };
}

function sanmaClosedRon() {
  const game = new SanmaGame("east", sanmaNames, { dealer: 0, wallFactory: () => sanmaWall({
    0: "m19p19s123z234567",
    1: "p123s123456789z5",
    2: "m119p246s246z2346",
  }, ["z5"]) });
  const dealer = game.view(0), discard = dealer.choices.find(choice => choice.type === "discard" && choice.value === "z5_");
  expect(discard).toBeDefined();
  game.respond(0, dealer.decisionId, discard!.id);
  const winnerBefore = game.view(1), ron = winnerBefore.choices.find(choice => choice.type === "ron");
  expect(ron).toBeDefined();
  game.respond(1, winnerBefore.decisionId, ron!.id);
  const result = game.view(1);
  expect(result.settlement).toMatchObject({ kind: "win", winnerSeat: 1, winningTile: "z5" });
  expect(result.settlement!.hand).toBe("p123s123456789z5");
  return result;
}

function sanmaPonThenRon() {
  const game = new SanmaGame("east", sanmaNames, { dealer: 0, wallFactory: () => sanmaWall({
    0: "m1p123s456z234567",
    1: "z11p123s123456z56",
    2: "m119p246s246z2346",
  }, ["z1", "z5"]) });

  const opening = game.view(0), east = opening.choices.find(choice => choice.type === "discard" && choice.value === "z1_");
  expect(east).toBeDefined();
  game.respond(0, opening.decisionId, east!.id);

  const response = game.view(1), pon = response.choices.find(choice => choice.type === "pon" && choice.value === "z111-");
  expect(pon).toBeDefined();
  game.respond(1, response.decisionId, pon!.id);
  expect(game.view(1).players.find(player => player.seat === 1)!.melds).toEqual(["z111-"]);

  const caller = game.view(1), discardSix = caller.choices.find(choice => choice.type === "discard" && choice.value === "z6");
  expect(discardSix).toBeDefined();
  game.respond(1, caller.decisionId, discardSix!.id);

  const next = game.view(2), drawDiscard = next.choices.find(choice => choice.type === "discard" && choice.value === "z5_");
  expect(drawDiscard).toBeDefined();
  game.respond(2, next.decisionId, drawDiscard!.id);

  const winnerBefore = game.view(1), ron = winnerBefore.choices.find(choice => choice.type === "ron");
  expect(ron).toBeDefined();
  game.respond(1, winnerBefore.decisionId, ron!.id);
  const result = game.view(1);
  expect(result.settlement).toMatchObject({ kind: "win", winnerSeat: 1, winningTile: "z5" });
  expect(result.settlement!.hand).toContain(",z111-");
  return result;
}

function riichiTsumo() {
  const game = new RiichiGame("east", riichiNames, riichiWall({ 0: "m123p123s123z1112" }, "z2"));
  const turn = game.view(0), tsumo = turn.choices.find(choice => choice.type === "tsumo");
  expect(turn.drawnTile).toBe("z2");
  expect(tsumo).toBeDefined();
  game.respond(0, turn.decisionId, tsumo!.id);
  const result = game.view(0);
  expect(result.settlement).toMatchObject({ kind: "win", winnerSeat: 0 });
  return result;
}

function showSettlement(game: GameView, variant: RoomView["variant"], ownSeat: number) {
  const names = variant === "sanma" ? sanmaNames : riichiNames;
  const onChoice = vi.fn();
  const room: RoomView = {
    id: `settlement-${variant}-${ownSeat}`, code: "ABCDEFGH", hostUserId: `user-${ownSeat}`,
    variant, mode: "east", status: "playing", version: 1, mySeat: ownSeat,
    members: names.map((displayName, seat) => ({ userId: `user-${seat}`, displayName, seat, kind: seat === ownSeat ? "human" : "bot", ready: true, connected: true })),
    game,
  };
  render(<GameRoom room={room} host={false} busy={false} ownSeat={ownSeat} connected motionCanAnimate={false} onChoice={onChoice} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);
  return screen.getByRole("region", { name: "本局结算" });
}

function tileFaces(element: ParentNode) {
  return [...element.querySelectorAll<HTMLElement>("[data-tile-face]")].map(tile => tile.dataset.tileFace!);
}

it("renders a real closed Sanma ron as thirteen closed tiles plus one separate winning tile", () => {
  const game = sanmaClosedRon(), settlement = game.settlement!;
  const panel = showSettlement(game, "sanma", 1);
  const hand = panel.querySelector(".mahjong-winning-hand")!;
  expect(tileFaces(hand)).toHaveLength(14);
  const winner = panel.querySelector<HTMLElement>('[data-testid="mahjong-winning-tile"]');
  expect(winner).not.toBeNull();
  expect(tileFaces(winner!)).toEqual(["z5"]);
  expect(tileFaces(hand).sort()).toEqual(["p1", "p2", "p3", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "z5", "z5"].sort());
  expect(panel.querySelector("h2")?.textContent).toContain("荣和");
  expect((settlement as typeof settlement & { winMethod?: string }).winMethod).toBe("ron");
});

it("keeps a real open East pon beside a closed Sanma ron hand", () => {
  const game = sanmaPonThenRon();
  const panel = showSettlement(game, "sanma", 1);
  const melds = panel.querySelectorAll(".mahjong-winning-hand__melds .mahjong-meld");
  expect(melds).toHaveLength(1);
  expect(melds[0].getAttribute("aria-label")).toContain("碰");
  expect(tileFaces(melds[0])).toEqual(["z1", "z1", "z1"]);
  expect(tileFaces(panel.querySelector(".mahjong-winning-hand")!)).toHaveLength(14);
  expect(tileFaces(panel.querySelector('[data-testid="mahjong-winning-tile"]')!)).toEqual(["z5"]);
  expect(panel.querySelector("h2")?.textContent).toContain("荣和");
  expect((game.settlement as typeof game.settlement & { winMethod?: string })?.winMethod).toBe("ron");
});

it("splits the actual Riichi tsumo from its fourteen physical tiles without duplicating it", () => {
  const game = riichiTsumo(), panel = showSettlement(game, "yonma", 0);
  const hand = panel.querySelector(".mahjong-winning-hand")!;
  expect(tileFaces(hand)).toHaveLength(14);
  const winner = panel.querySelector<HTMLElement>('[data-testid="mahjong-winning-tile"]');
  expect(winner).not.toBeNull();
  expect(tileFaces(winner!)).toEqual(["z2"]);
  expect(panel.querySelector("h2")?.textContent).toContain("自摸");
  expect((game.settlement as typeof game.settlement & { winMethod?: string })?.winMethod).toBe("tsumo");
  expect(game.settlement?.winningTile).toBe("z2");
  expect(tileFaces(hand).sort()).toEqual(["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "z1", "z1", "z1", "z2", "z2"].sort());
});

it("keeps a legacy real settlement readable when it has no win method or separate winning tile", () => {
  const legacy = structuredClone(sanmaClosedRon());
  delete legacy.settlement!.winningTile;
  delete (legacy.settlement as typeof legacy.settlement & { winMethod?: string }).winMethod;
  const panel = showSettlement(legacy, "sanma", 1);
  expect(panel.querySelector("h2")?.textContent).toBe("和了");
  expect(tileFaces(panel.querySelector(".mahjong-winning-hand")!)).toHaveLength(13);
  expect(panel.querySelector('[data-testid="mahjong-winning-tile"]')).toBeNull();
});
