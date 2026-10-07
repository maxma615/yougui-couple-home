// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { RoomMember } from "@/modules/mahjong/types";

const componentPath = "@/components/mahjong/mahjong-call-announcement";

function members(names = ["A", "B", "B · 荣和", "D"]): RoomMember[] {
  return names.map((displayName, seat) => ({
    userId: `user-${seat}`, displayName, kind: "human", seat, ready: true, connected: true,
  }));
}

async function loadAnnouncement() {
  const module = await import(componentPath).catch(() => null);
  expect(module?.MahjongCallAnnouncement).toBeTypeOf("function");
  return module!.MahjongCallAnnouncement;
}

afterEach(() => cleanup());

it("renders the confirmed action label, actor and avatar without parsing the display name", async () => {
  const MahjongCallAnnouncement = await loadAnnouncement();
  const feedback = {
    key: "decision-7", kind: "call", text: "B · 荣和 · 碰", seat: 2, actionLabel: "碰",
  };
  render(createElement(MahjongCallAnnouncement, { feedback, members: members(), ownSeat: 0 }));

  const status = screen.getByRole("status", { name: "牌桌动作" });
  expect(status.className).toContain("mahjong-table-feedback");
  expect(status.className).toContain("is-call");
  expect(status.className).toContain("mahjong-call-announcement");
  expect(status.getAttribute("data-feedback-seat")).toBe("2");
  expect(status.querySelector(".mahjong-call-announcement__portrait")?.getAttribute("data-avatar")).toBe("2");
  expect(status.querySelector(".mahjong-call-announcement__portrait")?.getAttribute("aria-hidden")).toBe("true");
  expect(status.querySelector(".mahjong-call-announcement__label")?.textContent).toBe("碰");
  expect(status.querySelector(".mahjong-call-announcement__actor")?.textContent).toBe("B · 荣和");
  expect(status.querySelector(".mahjong-call-announcement__accessible")?.textContent).toBe("B · 荣和 · 碰");
  expect(status.querySelector(".mahjong-call-announcement__label")?.getAttribute("aria-hidden")).toBe("true");
  expect(status.querySelector(".mahjong-call-announcement__actor")?.getAttribute("aria-hidden")).toBe("true");
});

it("uses the local player's short actor name for an acknowledged win", async () => {
  const MahjongCallAnnouncement = await loadAnnouncement();
  const feedback = {
    key: "decision-8", kind: "win", text: "你 · 自摸", seat: 0, actionLabel: "自摸",
  };
  render(createElement(MahjongCallAnnouncement, { feedback, members: members(), ownSeat: 0 }));

  const status = screen.getByRole("status", { name: "牌桌动作" });
  expect(status.className).toContain("is-win");
  expect(status.querySelector(".mahjong-call-announcement__actor")?.textContent).toBe("你");
  expect(status.querySelector(".mahjong-call-announcement__accessible")?.textContent).toBe("你 · 自摸");
});

it("announces a draw without assigning the local player's portrait to a table-wide result", async () => {
  const MahjongCallAnnouncement = await loadAnnouncement();
  const feedback = {key:"drawn-hand",kind:"win",text:"流局",actionLabel:"流局"};
  render(createElement(MahjongCallAnnouncement,{feedback,members:members(),ownSeat:2}));
  const status=screen.getByRole("status",{name:"牌桌动作"});
  expect(status.getAttribute("data-feedback-seat")).toBeNull();
  expect(status.querySelector(".mahjong-call-announcement__actor")?.textContent).toBe("牌桌");
  expect(status.querySelector(".mahjong-call-announcement__portrait")).toBeNull();
  expect(status.querySelector(".mahjong-call-announcement__accessible")?.textContent).toBe("流局");
});

it.each([
  ["legacy feedback without an action label", { key: "old", kind: "call", text: "P1 · 碰", seat: 1 }],
  ["ordinary draw feedback", { key: "draw", kind: "draw", text: "摸牌", seat: 0, actionLabel: "自摸" }],
  ["ordinary discard feedback", { key: "discard", kind: "discard", text: "P2 · 五筒", seat: 2, actionLabel: "碰" }],
])("returns nothing for %s so the existing simple text treatment remains available", async (_name, feedback) => {
  const MahjongCallAnnouncement = await loadAnnouncement();
  const { container } = render(createElement(MahjongCallAnnouncement, { feedback, members: members(), ownSeat: 0 }));
  expect(container.firstChild).toBeNull();
});
