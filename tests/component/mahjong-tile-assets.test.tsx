// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { TileFace } from "@/components/mahjong/mahjong-tile";

afterEach(cleanup);

it("renders every playable Japanese tile from a complete locally hosted stock set", () => {
  const keys = ["m", "p", "s"].flatMap(suit => Array.from({ length: 10 }, (_, n) => suit + n));
  keys.push(...Array.from({ length: 7 }, (_, n) => "z" + (n + 1)));
  const { container } = render(<>{keys.map(value => <TileFace key={value} value={value}/>)}</>);
  const images = [...container.querySelectorAll<HTMLImageElement>("img")];
  expect(images).toHaveLength(37);
  const sources = images.map(image => image.getAttribute("src")!);
  expect(new Set(sources).size).toBe(37);
  for (const [index, image] of images.entries()) {
    expect(image.closest("[data-tile-face]")?.getAttribute("data-tile-face")).toBe(keys[index]);
    expect(image.getAttribute("src")).toMatch(/^\/images\/mahjong-tiles\/regular\/[A-Za-z0-9-]+\.svg$/);
    expect(image.getAttribute("aria-hidden")).toBe("true");
    expect(image.getAttribute("draggable")).toBe("false");
    expect(readFileSync("public" + sources[index], "utf8")).toContain('viewBox="0 0 300 400"');
  }
  expect(container.querySelector("svg")).toBeNull();
});

it("keeps original red-five artwork when a server choice includes drawn-tile markers", () => {
  const select = vi.fn();
  render(<TileFace value="p0_*" type="button" onClick={select}/>);
  const button = screen.getByRole("button", { name: "五筒（赤）" });
  expect(button.querySelector("img")?.getAttribute("src")).toBe("/images/mahjong-tiles/regular/Pin5-Dora.svg");
  fireEvent.click(button);
  expect(select).toHaveBeenCalledOnce();
});

it("maps Japanese blank white dragon and all four winds without substituting glyph drawings", () => {
  const values = ["z1", "z2", "z3", "z4", "z5", "z6", "z7"];
  const files = ["Ton", "Nan", "Shaa", "Pei", "Haku", "Hatsu", "Chun"];
  const { container } = render(<>{values.map(value => <TileFace key={value} value={value}/>)}</>);
  expect([...container.querySelectorAll("img")].map(image => image.getAttribute("src")))
    .toEqual(files.map(file => `/images/mahjong-tiles/regular/${file}.svg`));
});

it("ships the exact pinned upstream files and original public-domain notice", () => {
  const manifest = JSON.parse(readFileSync("public/images/mahjong-tiles/manifest.json", "utf8"));
  expect(manifest.revision).toBe("26e127ba2117f45cdce5ea0225748cc0cfad3169");
  expect(Object.keys(manifest.files)).toHaveLength(39);
  for (const [path, file] of Object.entries(manifest.files) as [string, { sha256: string; gitBlobSha: string }][]) {
    const bytes = readFileSync("public/images/mahjong-tiles/" + path);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
    expect(createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")).toBe(file.gitBlobSha);
  }
  expect(readFileSync("public/licenses/FluffyStuff-riichi-mahjong-tiles-LICENSE.md", "utf8"))
    .toBe("This work is in the public domain. For more information, visit https://creativecommons.org/publicdomain/zero/1.0/.");
});
