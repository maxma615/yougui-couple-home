// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GameRoom } from "@/components/mahjong/mahjong-client";
import { northReplacementFixture } from "../fixtures/mahjong-view-game";
import type { RoomView } from "@/modules/mahjong/types";

afterEach(cleanup);

function room(viewer: number, count: number): RoomView {
  const game = northReplacementFixture().view(viewer);
  game.players = game.players.map(player => ({ ...player, nuki: player.seat === 0 ? count : 0 }));
  return {
    id: "nuki-volume-markup",
    code: "ABCDEFGH",
    hostUserId: "human-0",
    mode: "east",
    variant: "sanma",
    status: "playing",
    version: 1,
    mySeat: viewer,
    members: [0, 1, 2].map(seat => ({
      userId: `human-${seat}`,
      displayName: `玩家${seat}`,
      seat,
      kind: "human",
      ready: true,
      connected: true,
    })),
    game,
  };
}

function show(viewer: number, count: number) {
  return render(<GameRoom room={room(viewer, count)} busy={false} host ownSeat={viewer} connected
    motionCanAnimate={false} onChoice={() => {}} onFinish={() => {}} onRematch={() => {}} onLeave={() => {}}/>);
}

it.each([1, 2, 3, 4])("renders %i extracted North tiles as persistent six-plane bodies", count => {
  show(0, count);
  const tray = screen.getByTestId("nuki-tiles-0");
  const slots = [...tray.querySelectorAll<HTMLElement>("[data-nuki-index]")];
  expect(slots).toHaveLength(count);
  for (const [index, slot] of slots.entries()) {
    const volume = slot.querySelector<HTMLElement>("[data-nuki-volume]");
    expect(volume).not.toBeNull();
    expect(volume?.querySelector('.mahjong-discard-flight__face-up-cap [data-tile-face="z4"]')).not.toBeNull();
    expect(volume?.querySelector("[data-flight-base]")).not.toBeNull();
    expect(volume?.querySelector("[data-flight-contact]")).not.toBeNull();
    expect([...volume!.querySelectorAll<HTMLElement>("[data-flight-side]")].map(side => side.dataset.flightSide).sort())
      .toEqual(["bottom", "left", "right", "top"]);
    expect(slot.dataset.nukiIndex).toBe(String(index));
  }
});

it.each([
  [0, "mahjong-table__own-public"],
  [1, "mahjong-table__position--west"],
  [2, "mahjong-table__position--east"],
] as const)("keeps North tray bodies anchored at seat 0 for viewer seat %i", (viewer, expectedPosition) => {
  show(viewer, 4);
  const tray = screen.getByTestId("nuki-tiles-0");
  const position = tray.closest(".mahjong-table__position, .mahjong-table__own-public");
  expect(position?.classList.contains(expectedPosition)).toBe(true);
  expect(tray.querySelectorAll("[data-nuki-volume]")).toHaveLength(4);
});
