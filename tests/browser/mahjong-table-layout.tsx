// Public display stress fixtures exercise maximum footprints, separately from real-game tests.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import { chromium, webkit } from "@playwright/test";
import { GameRoom, PublicMeldDialog } from "../../src/components/mahjong/mahjong-client";
import type { GameView, RoomView } from "../../src/modules/mahjong/types";

let passed = 0;
for (const engine of [chromium, webkit]) {
 const browser = await engine.launch({headless:true});
 try {
  const page = await browser.newPage();
  // Stock faces are real public assets: exercise successful decoding rather than
  // accepting image-less geometry from setContent on about:blank.
  await page.route("https://mahjong.local/images/**", async route => {
    const file = new URL(route.request().url()).pathname;
    await route.fulfill({ status: 200, contentType: file.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: readFileSync("public" + file) });
  });
  for (const variant of ["sanma", "yonma"] as const) for (const width of [667, 844, 1280, 1440]) for (const connected of [true, false]) {
    const capacity = variant === "sanma" ? 3 : 4;
    const game: GameView = {
      decisionId: "display-fixture", phase: "dapai", roundWind: 0, roundNumber: 1, honba: 2,
      remainingTiles: 8, riichiSticks: 2, turnSeat: 0, drawnTile: null,
      hand: ["p9"], choices: [{id:"tsumo",type:"tsumo"},{id:"riichi:p9",type:"riichi",value:"p9"}], settlement: null, ranking: null,
      doraIndicators: ["p1", "s2", "z1", "p4", "m9"],
      players: Array.from({length:capacity}, (_,seat) => ({seat, wind:seat, score:35000, handCount:1,
        discards:Array.from({length:24}, (_,i) => `p${i % 9 + 1}${i === 3 ? "*" : ""}`),
        melds:["p111+", "p222+", "s333+", "s444+"], riichi:true, ...(variant === "sanma" ? {nuki:seat === 0 ? 4 : 2} : {})})),
    };
    const room: RoomView = {id:"display", code:"ABCDEFGH", hostUserId:"a", mode:"east", variant,
      status:"playing", version:1, mySeat:0, game,
      members:game.players.map(p => ({userId:String(p.seat),seat:p.seat,displayName:`牌友${p.seat}`,kind:"human",ready:true,connected:true})),
    };
    const noop = () => {};
    const html = renderToStaticMarkup(<GameRoom room={room} host busy={false} ownSeat={0} connected={connected} onChoice={noop} onFinish={noop} onLeave={noop} onRematch={noop}/>);
    const height = ({667:375,844:390,1280:720,1440:810} as Record<number,number>)[width];
    await page.setViewportSize({width, height});
    const css = ["mahjong.css", "mahjong-river.css", "mahjong-meld.css", "mahjong-interaction.css", "mahjong-discard-motion.css"].map(file => readFileSync("src/app/mahjong/" + file, "utf8")).join("\n");
    await page.setContent(`<base href="https://mahjong.local/"><style>body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}${css}</style><main class="mahjong-page"><div class="mahjong-shell">${html}</div></main>`);
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>("img.mahjong-tile__art")].every(image => image.complete && image.naturalWidth === 300 && image.naturalHeight === 400));
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.evaluate(()=>document.querySelector(".mahjong-game")!.insertAdjacentHTML("afterbegin",'<div class="mahjong-screen-hint" role="status" aria-label="屏幕方向提示">请旋转手机</div>'));
    assert.equal(await page.getByTestId("mahjong-dora").locator("[data-tile-face]").count(), 5);
    const covered = await page.evaluate(() => {
      const hidden:string[]=[];
      for (const el of document.querySelectorAll(".mahjong-river__tile, .mahjong-player__head strong, .mahjong-player__melds [data-tile-face], .mahjong-hand-public-melds [data-tile-face], .mahjong-table__dora [data-tile-face], .mahjong-nuki-tray [data-tile-face]")) {
        const r=el.getBoundingClientRect(), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        if (!hit || !el.contains(hit)) hidden.push(`${el.closest('[data-testid]')?.getAttribute('data-testid')}: ${el.textContent || el.getAttribute('data-tile-face')} covered by ${hit?.className}`);
      }
      return hidden;
    });
    await page.screenshot({path:`.local/table-new-${engine.name()}-${variant}-${width}-${connected}.png`});
    assert.deepEqual(covered, [], `${engine.name()} ${variant} ${width}: covered public information`);
    if (variant === "sanma") {
      for (const player of game.players) assert.equal(await page.getByTestId(`nuki-tiles-${player.seat}`).locator('[data-tile-face="z4"]').count(), player.nuki);
    } else assert.equal(await page.locator(".mahjong-nuki-tray").count(),0);
    const boardBounds = await page.getByTestId('mahjong-board').boundingBox();
    assert.equal(boardBounds?.y, 0, 'reconnect or orientation hints must not shift the viewport table');
    for (const label of ["自摸", "立直"]) {
      const button = page.getByRole('button', {name:label, exact:true});
      const rect = await button.boundingBox();
      assert.ok(rect && rect.y >= 0 && rect.y + rect.height <= height, `${engine.name()} ${width}: ${label} outside viewport`);
      assert.equal(await button.isEnabled(), connected, 'stale actions cannot submit while disconnected');
    }
    // Five simultaneous response types must fit beside the public river, not over it.
    // Multiple chi/kan alternatives use the actual grouped action JSX.
    const responseGame:GameView={...game,choices:[{id:"ron",type:"ron"},{id:"kan:p1111",type:"kan",value:"p1111"},{id:"kan:s2222",type:"kan",value:"s2222"},{id:"pon:p111+",type:"pon",value:"p111+"},{id:"chi:p123-",type:"chi",value:"p123-"},{id:"chi:p234-",type:"chi",value:"p234-"},{id:"pass",type:"pass"}]};
    const response=renderToStaticMarkup(<GameRoom room={{...room,game:responseGame}} host busy={false} ownSeat={0} connected={connected} onChoice={noop} onFinish={noop} onLeave={noop} onRematch={noop}/>);
    await page.evaluate(html=>{const parsed=new DOMParser().parseFromString(html,'text/html');document.querySelector('.mahjong-action-dock')!.replaceWith(parsed.querySelector('.mahjong-action-dock')!);},response);
    assert.equal(await page.locator('.mahjong-action-dock > button').count(),5);
    const actionOverlap=await page.evaluate(()=>{
      const issues:string[]=[];
      const targets=document.querySelectorAll('.mahjong-river--0 .mahjong-river__tile,.mahjong-table__own .mahjong-nuki-tray,.mahjong-hand [data-tile-face],.mahjong-hand-public-melds [data-tile-face]');
      for(const button of document.querySelectorAll('.mahjong-action-dock > button')){
        const b=button.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
        if(b.left<0||b.top<0||b.right>innerWidth||b.bottom>innerHeight||!hit||!button.contains(hit)) issues.push('response action outside viewport or not clickable');
        for(const target of targets){const t=target.getBoundingClientRect();if(b.left<t.right&&b.right>t.left&&b.top<t.bottom&&b.bottom>t.top)issues.push(`response action covers ${target.className}`);}
      }
      return issues;
    });
    assert.deepEqual(actionOverlap,[],`${engine.name()} ${variant} ${width}: five response actions cover own public information`);
    const detail = renderToStaticMarkup(<PublicMeldDialog player={game.players[1]} member={room.members[1]} onClose={noop}/>);
    await page.evaluate(html => {document.querySelector('.mahjong-page')!.insertAdjacentHTML('beforeend', html);document.querySelector<HTMLDialogElement>('.mahjong-public-melds')!.showModal();}, detail);
    const faceSize = await page.locator('.mahjong-public-melds [data-tile-face]').first().boundingBox();
    assert.ok(faceSize && faceSize.width >= 39 && faceSize.height >= 56, 'zoomed public faces remain readable');
    assert.equal(await page.getByRole('dialog', {name:'牌友1的公开副露'}).isVisible(), true);
    await page.evaluate(() => document.querySelector<HTMLDialogElement>('.mahjong-public-melds')!.close());
    await page.evaluate(() => document.querySelector('.mahjong-shell')!.insertAdjacentHTML('afterbegin','<div class="mahjong-notice" role="alert"><span>牌局已更新，请按当前牌面操作</span><button type="button" aria-label="关闭提示">×</button></div>'));
    const alertVisible = await page.getByRole('alert').evaluate(el => {const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
    assert.equal(alertVisible,true,'server error notice must remain above the fixed table');
    passed++; console.log(`PASS ${engine.name()} ${variant} ${width} connected=${connected}: rivers, indicators, melds, actions, notice`);
  }
 } finally {await browser.close();}
}
console.log(`${passed}/32 layout cases passed.`);
