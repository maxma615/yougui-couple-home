// Physical display fixtures isolate rack geometry; they do not simulate legal play.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, webkit } from "@playwright/test";
import Majiang from "@kobalab/majiang-core";
import { GameRoom } from "../../src/components/mahjong/mahjong-client";
import { sanmaTiles } from "../../src/modules/mahjong/sanma-wall";
import type { GameVariant, RoomView } from "../../src/modules/mahjong/types";

const groups = ["s111+", "p2222", "s3333=", "z222=2"];
const css = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css", "mahjong-table-center.css", "mahjong-table-edge.css", "mahjong-camera.css"].map(file => readFileSync(`src/app/mahjong/${file}`, "utf8")).join("\n");
function fixture(variant: GameVariant, meldCount: number, drawn: boolean): RoomView {
  const capacity = variant === "sanma" ? 3 : 4;
  const available: string[] = (variant === "sanma" ? sanmaTiles() : new Majiang.Shan(Majiang.rule())._pai.slice()).sort();
  assert.equal(available.length, variant === "sanma" ? 108 : 136);
  if (variant === "sanma") assert.ok(!available.some(tile => /^m[02-8]$/.test(tile)), "Sanma must exclude the red five of characters as well as ordinary two through eight");
  const take = (tile: string) => {
    const index = available.indexOf(tile);
    assert.ok(index >= 0, `physical tile exhausted: ${tile}`);
    return available.splice(index, 1)[0];
  };
  const melds = groups.slice(0, meldCount);
  for (const meld of melds) for (const rank of meld.slice(1).replace(/\D/g, "")) take(meld[0] + rank);
  if (variant === "sanma") for (let i = 0; i < 4; i++) take("z4");
  const indicator = take("p5");
  const hand = available.splice(0, (drawn ? 14 : 13) - 3 * meldCount);
  const drawnTile = drawn ? hand.at(-1)! : null;
  const players = Array.from({ length: capacity }, (_, seat) => ({
    seat, wind: seat, score: variant === "sanma" ? 35000 : 25000,
    handCount: seat === 0 ? hand.length : available.splice(0, 13).length,
    discards: [], melds: seat === 0 ? melds : [], riichi: false,
    ...(variant === "sanma" ? { nuki: seat === 0 ? 4 : 0 } : {}),
  }));
  return { id: "own-lane-display", code: "ABCDEFGH", hostUserId: "0", mode: "east", variant, status: "playing", version: 1, mySeat: 0,
    members: players.map(p => ({ userId: String(p.seat), seat: p.seat, displayName: `牌友${p.seat}`, kind: "human", ready: true, connected: true })),
    game: { gameInstanceId: "lane", handId: 1, decisionId: "lane:1", phase: drawn ? "zimo" : "dapai", roundWind: 0, roundNumber: 1, honba: 0, riichiSticks: 0,
      remainingTiles: 30, turnSeat: drawn ? 0 : 1, hand, drawnTile, players, doraIndicators: [indicator], choices: [], settlement: null, ranking: null },
  };
}

let cases = 0;
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("https://mahjong.local/images/**", async route => {
      const path = new URL(route.request().url()).pathname;
      await route.fulfill({ status: 200, contentType: path.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync("public" + path) });
    });
    for (const variant of ["sanma", "yonma"] as const) for (const [width, height] of [[667, 375], [844, 390], [1280, 720], [1440, 810]]) {
      await page.setViewportSize({ width, height });
      let baselineX: number | undefined;
      for (const drawn of [false, true]) for (let m = 0; m <= 4; m++) {
        const room = fixture(variant, m, drawn), noop = () => {};
        const html = renderToStaticMarkup(<GameRoom room={room} ownSeat={0} host busy={false} connected motionCanAnimate={false} onChoice={noop} onFinish={noop} onLeave={noop} onRematch={noop}/>);
        await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}*,*::before,*::after{box-sizing:border-box}${css}</style><main class="mahjong-page"><div class="mahjong-shell">${html}</div></main>`);
        await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(i => i.complete && i.naturalWidth === 300 && i.naturalHeight === 400));
        const board = (await page.getByTestId("mahjong-board").boundingBox())!;
        const first = (await page.getByTestId("mahjong-hand").locator("[data-tile-face]").first().boundingBox())!;
        if (baselineX === undefined) baselineX = first.x;
        assert.ok(Math.abs(first.x - baselineX) < .6, `${engine.name()} ${variant} ${width} melds=${m} drawn=${drawn}: calling or drawing must not recenter the concealed rack (${first.x} vs ${baselineX})`);
        const left = (first.x - board.x) / board.width;
        assert.ok(left > .11 && left < .14, `${engine.name()} ${variant} ${width}: own hand must begin near the reference's left lane, got ${left}`);
        if (m) {
          const publicRack = (await page.locator(".mahjong-hand-public-melds").boundingBox())!;
          const concealed = (await page.getByTestId("mahjong-hand").boundingBox())!;
          assert.ok(publicRack.x - concealed.x - concealed.width >= 10, "public melds must have a separate lane after the concealed rack");
          const right = (publicRack.x + publicRack.width - board.x) / board.width;
          assert.ok(right >= .93 && right <= .96, `declared melds must stay at the right edge, got ${right}`);
        }
        const issues = await page.evaluate(() => {
          const issues: string[] = [], board = document.querySelector(".mahjong-table")!.getBoundingClientRect();
          for (const tile of document.querySelectorAll<HTMLElement>(".mahjong-hand [data-tile-face],.mahjong-hand-public-melds [data-tile-face],.mahjong-hand-public-melds .mahjong-meld__back,.mahjong-table__own .mahjong-nuki-tray [data-tile-face]")) {
            if (tile.closest("[data-layer='called']")) continue; // Kakan intentionally overlaps its called tile.
            const b = tile.getBoundingClientRect();
            if (b.left < board.left || b.right > board.right || b.top < board.top || b.bottom > board.bottom) issues.push("tile outside table");
            for (const [x, y] of [[.16, .16], [.84, .16], [.5, .5], [.16, .84], [.84, .84]]) if (!tile.contains(document.elementFromPoint(b.left + b.width * x, b.top + b.height * y))) issues.push(`covered ${tile.getAttribute("data-tile-face") || "back"}`);
          }
          return issues;
        });
        assert.deepEqual(issues, [], `${engine.name()} ${variant} ${width} melds=${m} drawn=${drawn}`);
        if (width === 844 && drawn && m === 2) await page.screenshot({ path: `.local/own-lane-${engine.name()}-${variant}-844.png` });
        cases++;
      }
      console.log(`PASS ${engine.name()} ${variant} ${width}: ten rack/meld/draw states, stable left and right lanes`);
    }
  } finally { await browser.close(); }
}
console.log(`${cases}/160 physical own-hand lane fixtures passed.`);
