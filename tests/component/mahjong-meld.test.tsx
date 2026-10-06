// @vitest-environment jsdom
import { expect, it } from "vitest";
import { createElement } from "react";
import { render, within } from "@testing-library/react";
import Majiang from "@kobalab/majiang-core";

const componentPath = "@/components/mahjong/mahjong-meld";
const coreShoupai = Majiang.Shoupai as unknown as {
  valid_mianzi: (meld: string) => string | undefined;
};

async function loadMeldComponent() {
  const module = await import(componentPath);
  return module.MahjongMeld;
}

async function renderMeld(meld: string) {
  const MahjongMeld = await loadMeldComponent();
  return render(createElement(MahjongMeld, { meld }));
}

function expectEngineMeld(meld: string) {
  expect(coreShoupai.valid_mianzi(meld)).toBe(meld);
}

function visibleFaces(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-tile-face]")];
}

function sidewaysSlots(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(".mahjong-meld__slot.is-sideways")];
}

it("exports the validated meld renderer", async () => {
  const module = await import(componentPath).catch(() => null);
  expect(module?.MahjongMeld).toBeTypeOf("function");
});

it("puts the called chi tile first and preserves a called red five", async () => {
  const meld = "m340-";
  expectEngineMeld(meld);
  const { container } = await renderMeld(meld);
  expect(visibleFaces(container).map(tile => tile.getAttribute("data-tile-face")))
    .toEqual(["m0", "m3", "m4"]);
  expect(sidewaysSlots(container).map(slot => slot.getAttribute("data-tile-value")))
    .toEqual(["m0"]);
  expect(within(container).getByRole("group", { name: "吃，自上家" })).toBeTruthy();
  expect(container.querySelector("img[src$='Man5-Dora.svg']")).not.toBeNull();
});

it.each([
  ["p12-3", ["p2", "p1", "p3"]],
  ["m3-45", ["m3", "m4", "m5"]],
  ["s40-6", ["s0", "s4", "s6"]],
])("renders a chi whose called tile precedes the last rank: %s", async (meld, faces) => {
  expectEngineMeld(meld);
  const { container } = await renderMeld(meld);
  expect(visibleFaces(container).map(tile => tile.getAttribute("data-tile-face"))).toEqual(faces);
  expect(sidewaysSlots(container).map(slot => slot.getAttribute("data-tile-value"))).toEqual([faces[0]]);
  expect(within(container).getByRole("group", { name: "吃，自上家" })).toBeTruthy();
});

it.each([
  ["p555+", [false, false, true], "下家"],
  ["p555=", [false, true, false], "对家"],
  ["p555-", [true, false, false], "上家"],
])("positions a called pon from source %s", async (meld, expectedSideways, source) => {
  expectEngineMeld(meld);
  const { container } = await renderMeld(meld);
  const slots = [...container.querySelectorAll<HTMLElement>(".mahjong-meld__slot")];
  expect(slots).toHaveLength(3);
  expect(slots.map(slot => slot.classList.contains("is-sideways"))).toEqual(expectedSideways);
  expect(within(container).getByRole("group", { name: `碰，来自${source}` })).toBeTruthy();
});

it.each([
  ["m5555+", [false, false, false, true]],
  ["p5555=", [false, true, false, false]],
  ["s5555-", [true, false, false, false]],
])("positions all four daiminkan tiles from source %s", async (meld, expectedSideways) => {
  expectEngineMeld(meld);
  const { container } = await renderMeld(meld);
  const slots = [...container.querySelectorAll<HTMLElement>(".mahjong-meld__slot")];
  expect(slots).toHaveLength(4);
  expect(slots.map(slot => slot.classList.contains("is-sideways"))).toEqual(expectedSideways);
});

it("stacks the kakan fourth tile above the original called red five", async () => {
  const meld = "p550=5";
  expectEngineMeld(meld);
  const { container } = await renderMeld(meld);
  const stack = container.querySelector<HTMLElement>(".mahjong-meld__stack");
  expect(stack).not.toBeNull();
  expect(container.querySelector(".mahjong-meld__tiles")?.children).toHaveLength(3);
  expect(container.querySelectorAll(".mahjong-meld__slot")).toHaveLength(4);
  expect(visibleFaces(container)).toHaveLength(4);
  expect(stack?.querySelector("[data-layer='added'] [data-tile-face='p5']")).not.toBeNull();
  expect(stack?.querySelector("[data-layer='called'] [data-tile-face='p0']")).not.toBeNull();
  expect(stack?.querySelector("[data-layer='called'] img[src$='Pin5-Dora.svg']")).not.toBeNull();
  expect(stack?.querySelector("[data-layer='added']")?.classList.contains("is-sideways")).toBe(true);
  expect(stack?.querySelector("[data-layer='called']")?.classList.contains("is-sideways")).toBe(true);
});

it("keeps concealed kan faces hidden until a Mahjong Soul reference confirms its display", async () => {
  const meld = "m5550";
  expectEngineMeld(meld);
  const { container } = await renderMeld(meld);
  expect(container.querySelectorAll(".mahjong-meld__back")).toHaveLength(4);
  expect(visibleFaces(container)).toHaveLength(0);
  expect(container.querySelector("img")).toBeNull();
  expect(within(container).getByRole("group", { name: "暗杠，暗牌" })).toBeTruthy();
});

it("does not expose impossible duplicate red-five faces", async () => {
  const meld = "p500+";
  expect(coreShoupai.valid_mianzi(meld)).toBe(meld);
  const { container } = await renderMeld(meld);
  expect(container.firstChild).toBeNull();
  expect(container.querySelector("img, [data-tile-face]")).toBeNull();
});

it.each(["p5554", "m13-5", "z123-", "p555++", "x111+"])(
  "does not render a face for invalid meld %s",
  async meld => {
    expect(coreShoupai.valid_mianzi(meld)).toBeUndefined();
    const { container } = await renderMeld(meld);
    expect(container.firstChild).toBeNull();
    expect(container.querySelector("img, [data-tile-face]")).toBeNull();
  },
);
