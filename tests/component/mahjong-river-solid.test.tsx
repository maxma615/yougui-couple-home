// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RiichiGame } from "@/modules/mahjong/engine";
import { MahjongRiver } from "@/components/mahjong/mahjong-river";

afterEach(cleanup);

it("keeps six-column river identities while giving every visible discard a raised cap and four sides", () => {
  const game = new RiichiGame("east", ["A", "B", "C", "D"], { dealer: 0 });
  const player = game.view(0).players[0];
  player.discards = ["m1", "m2", "m3*", "m4", "m5+", "m6", "m7_", "m8"];

  render(<MahjongRiver player={player} offset={0}/>);

  const river = screen.getByTestId("river-0");
  const slots = [...river.querySelectorAll<HTMLElement>(".mahjong-river__tile")];
  expect([...river.querySelectorAll<HTMLElement>("[data-river-row]")].map(row => row.children.length)).toEqual([6, 1]);
  expect(slots.map(slot => slot.dataset.riverIndex)).toEqual(["0", "1", "2", "3", "5", "6", "7"]);
  expect(slots.map(slot => slot.dataset.tile)).toEqual(["m1", "m2", "m3", "m4", "m6", "m7", "m8"]);

  for (const slot of slots) {
    const volume = slot.querySelector<HTMLElement>("[data-river-volume]");
    expect(volume, `discard ${slot.dataset.riverIndex} should contain a solid body`).not.toBeNull();
    expect(volume?.querySelectorAll("[data-river-side]")).toHaveLength(4);
    expect(volume?.querySelector("[data-river-surface='cap'] [data-tile-face]")).toHaveAttribute("data-tile-face", slot.dataset.tile);
    expect(volume?.querySelectorAll("[data-tile-face]")).toHaveLength(1);
  }
});
