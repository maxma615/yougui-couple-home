// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { GameRoom } from "@/components/mahjong/mahjong-client";
import { RiichiGame } from "@/modules/mahjong/engine";
import { SanmaGame } from "@/modules/mahjong/sanma";
import type { GameVariant, GameView, RoomView } from "@/modules/mahjong/types";

const winds = ["東", "南", "西", "北"];
afterEach(cleanup);

function actualView(variant: GameVariant, viewerSeat: number): GameView {
  const game = variant === "yonma"
    ? new RiichiGame("east", ["A", "B", "C", "D"])
    : new SanmaGame("east", ["A", "B", "C"]);
  const view = game.view(viewerSeat);
  // Keep the engine's real public DTO shape while assigning readable fixture counts.
  view.honba = 2;
  view.riichiSticks = 3;
  view.players = view.players.map(player => ({ ...player, score: 31_250 + player.seat * 1_125 }));
  return view;
}

function showTable(view: GameView, variant: GameVariant, viewerSeat: number) {
  const capacity = view.players.length;
  const room: RoomView = {
    id: `fixture-${variant}-${viewerSeat}`,
    code: "ABCDEFGH",
    hostUserId: `player-${viewerSeat}`,
    mode: "east",
    variant,
    status: "playing",
    version: 1,
    mySeat: viewerSeat,
    members: Array.from({ length: capacity }, (_, seat) => ({
      userId: `player-${seat}`,
      kind: "human",
      displayName: `玩家${seat}`,
      seat,
      ready: true,
      connected: true,
    })),
    game: view,
  };
  render(<GameRoom room={room} busy={false} host ownSeat={viewerSeat} connected onChoice={() => {}} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);
}

for (const variant of ["sanma", "yonma"] as const) {
  const capacity = variant === "sanma" ? 3 : 4;
  for (let viewerSeat = 0; viewerSeat < capacity; viewerSeat++) {
    it(`${capacity}家 viewer ${viewerSeat} sees each engine DTO wind and score at its relative seat`, () => {
      const view = actualView(variant, viewerSeat);
      showTable(view, variant, viewerSeat);

      const readouts = [...document.querySelectorAll<HTMLElement>(".mahjong-center-seat")];
      expect(readouts).toHaveLength(capacity);
      for (const player of view.players) {
        const offset = (player.seat - viewerSeat + capacity) % capacity;
        const readout = readouts.find(item => item.dataset.seat === String(player.seat));
        expect(readout).toBeDefined();
        expect(readout!.classList.contains(`mahjong-center-seat--${offset}`)).toBe(true);
        expect(readout!.getAttribute("aria-label")).toBe(`${winds[player.wind]}家 ${player.score.toLocaleString()} 点`);
        expect(readout!.querySelector(".mahjong-center-seat__wind")?.textContent).toBe(winds[player.wind]);
        expect(readout!.querySelector("b")?.textContent).toBe(player.score.toLocaleString());
      }
    });
  }
}

it("shows live honba and riichi stick counts below the dora details, with round and wall left at center", () => {
  const view = actualView("yonma", 0);
  view.remainingTiles = 47;
  showTable(view, "yonma", 0);

  const dora = screen.getByTestId("mahjong-dora");
  const counters = dora.querySelector<HTMLElement>(".mahjong-table__counters");
  expect(counters).not.toBeNull();
  expect(within(counters!).getByLabelText("本场 2")).toBeTruthy();
  expect(within(counters!).getByLabelText("立直棒 3")).toBeTruthy();
  expect(dora.querySelector(".mahjong-table__dora > small")!.compareDocumentPosition(counters!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  const center = screen.getByLabelText("场况台");
  expect(center.textContent).toContain("局");
  expect(center.textContent).toContain("47");
  expect(center.textContent).not.toMatch(/本场|立直棒|供托/);
});
