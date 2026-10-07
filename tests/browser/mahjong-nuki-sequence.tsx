import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium, webkit } from '@playwright/test';
import { SanmaGame } from '../../src/modules/mahjong/sanma';
import { SanmaWall, sanmaTiles } from '../../src/modules/mahjong/sanma-wall';
import type { RoomView } from '../../src/modules/mahjong/types';
const out = `.local/audit/nuki-sequence-${process.env.NUKI_STAGE || 'green'}-${Date.now()}`;
mkdirSync(out, {
  recursive: true
});
const names = ['甲', '乙', '丙'];
function fixture(hand: string, draw: string, reserve: string[], otherHands: Record<number, string> = {}) {
  return {
    dealer: 0,
    wallFactory: () => {
      const available = sanmaTiles();
      const take = (t: string) => {
        const i = available.indexOf(t);
        assert.ok(i >= 0, `physical tile exhausted ${t}`);
        return available.splice(i, 1)[0];
      };
      const dealt = [[...hand.matchAll(/([mpsz])(\d+)/g)].flatMap(m => [...m[2]].map(n => take(m[1] + n))), [], []];
      assert.equal(dealt[0].length, 13);
      for (const [seat, encoded] of Object.entries(otherHands)) dealt[Number(seat)] = [...encoded.matchAll(/([mpsz])(\d+)/g)].flatMap(m => [...m[2]].map(n => take(m[1] + n)));
      const draws = [take(draw)],
        replacements = reserve.map(take);
      for (let i = 1; i < 3; i++) if (!dealt[i].length) dealt[i] = available.splice(0, 13);
      replacements.push(...available.splice(0, 4 - replacements.length));
      const indicators = available.splice(0, 10);
      return new SanmaWall([...dealt.flat(), ...draws, ...available, ...replacements, ...indicators]);
    }
  };
}
function room(game: SanmaGame, version = 10, viewer = 0): RoomView {
  return {
    id: 'nuki-browser',
    code: 'ABCDEFGH',
    hostUserId: 'u0',
    variant: 'sanma',
    mode: 'east',
    status: 'playing',
    version,
    mySeat: viewer,
    game: game.view(viewer),
    members: names.map((displayName, seat) => ({
      userId: `u${seat}`,
      displayName,
      seat,
      ready: true,
      connected: true,
      kind: 'human'
    }))
  };
}
const harness = `import React from 'react';import{createRoot}from'react-dom/client';import{flushSync}from'react-dom';import{GameRoom}from'./src/components/mahjong/mahjong-client';const root=createRoot(document.getElementById('root'));window.nukiChoices=[];window.nukiApi={render:(room,opts={})=>flushSync(()=>root.render(React.createElement('main',{className:'mahjong-page'},React.createElement('div',{className:'mahjong-shell'},React.createElement(GameRoom,{room,ownSeat:room.mySeat,host:true,busy:false,connected:opts.connected??true,motionCanAnimate:opts.canAnimate??true,onChoice:choice=>window.nukiChoices.push(choice),onFinish:()=>{},onLeave:()=>{},onRematch:()=>{}}))))),dispose:()=>root.unmount()};`;
const bundle = await build({
  stdin: {
    contents: harness,
    resolveDir: process.cwd(),
    loader: 'tsx'
  },
  bundle: true,
  platform: 'browser',
  format: 'iife',
  write: false,
  jsx: 'automatic',
  define: {
    'process.env.NODE_ENV': '"development"'
  }
});
const css = ['mahjong.css', 'mahjong-river.css', 'mahjong-meld.css', 'mahjong-interaction.css', 'mahjong-discard-motion.css', 'mahjong-table-center.css', 'mahjong-table-edge.css', 'mahjong-camera.css'].map(f => readFileSync(`src/app/mahjong/${f}`, 'utf8')).join('\n');
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const viewport of [{
      width: 667,
      height: 375
    }, {
      width: 844,
      height: 390
    }, {
      width: 1440,
      height: 810
    }]) {
      for (const kind of ['drawnNorth', 'closedNorthWithDrawnSurvivor', 'duplicateNorthFallback', 'secondNorthCumulative'] as const) {
        const game = new SanmaGame('east', names, fixture(kind === 'drawnNorth' || kind === 'secondNorthCumulative' ? 'p123456789s123z2' : kind === 'duplicateNorthFallback' ? 'p123456789s12z44' : 'p123455789s123z4', kind === 'closedNorthWithDrawnSurvivor' ? 'p0' : 'z4', kind === 'secondNorthCumulative' ? ['z4', 's4'] : ['s4']));
        let current = room(game);
        const page = await browser.newPage({
          viewport
        });
        const errors: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        try {
          await page.route('https://mahjong.local/images/**', r => {
            const path = new URL(r.request().url()).pathname;
            return r.fulfill({
              status: 200,
              contentType: path.endsWith('.svg') ? 'image/svg+xml' : 'image/webp',
              body: readFileSync(`public${path}`)
            });
          });
          await page.setContent(`<base href="https://mahjong.local/"><style>*{box-sizing:border-box}body{margin:0;line-height:1.65;--font-body:sans-serif;--font-display:serif}${css}</style><div id="root"></div>`);
          await page.addScriptTag({
            content: `globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle.outputFiles[0].text}`
          });
          await page.evaluate(r => (window as any).nukiApi.render(r), current);
          const count = kind === 'secondNorthCumulative' ? 2 : 1;
          const evidence: any = {
            kind,
            engine: engine.name(),
            viewport,
            steps: []
          };
          for (let step = 0; step < count; step++) {
            const beforeHand = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.mahjong-hand button[data-hand-instance-id]')].map(e => ({
              id: e.dataset.handInstanceId!,
              face: e.dataset.tileFace!,
              rect: e.getBoundingClientRect().toJSON()
            })));
            const source = await page.locator('.mahjong-hand button[data-tile-face="z4"]').first().boundingBox();
            assert.ok(source);
            const oldGame = current.game!;
            assert.ok(oldGame.choices.some(c => c.type === 'nuki'));
            await page.getByRole('button', {
              name: '拔北',
              exact: true
            }).click();
            const choices = await page.evaluate(() => (window as any).nukiChoices);
            const choice = choices.at(-1);
            assert.equal(choice.type, 'nuki');
            game.respond(0, oldGame.decisionId, choice.id);
            current = room(game, current.version + 1);
            await page.evaluate(r => (window as any).nukiApi.render(r), current);
            for (let seat = 0; seat < 3; seat++) {
              const v = game.view(seat),
                pass = v.choices.find(c => c.type === 'pass');
              if (pass) {
                game.respond(seat, v.decisionId, pass.id);
                current = room(game, current.version + 1);
                await page.evaluate(r => (window as any).nukiApi.render(r), current);
              }
            }
            await page.evaluate(r => (window as any).nukiApi.render(r), current);
            const observed = await page.evaluate(async () => {
              const flight = document.querySelector<HTMLElement>('[data-testid="mahjong-nuki-flight"]');
              const target = document.querySelector<HTMLElement>('[data-nuki-seat="0"] .mahjong-nuki-tray__tiles')?.lastElementChild?.firstElementChild as HTMLElement;
              const drawn = document.querySelector<HTMLElement>('.mahjong-hand .is-drawn');
              const rect = (e: HTMLElement | null) => e?.getBoundingClientRect().toJSON();
              const animation = flight?.getAnimations()[0];
              const read = () => ({
                flight: rect(flight),
                target: rect(target),
                targetVisibility: target ? getComputedStyle(target).visibility : null,
                drawVisibility: drawn ? getComputedStyle(drawn).visibility : null,
              drawOpacity: drawn ? getComputedStyle(drawn).opacity : null,
                drawArriving: drawn?.classList.contains('is-draw-arriving'),
                flightExists: !!flight
              });
              const reflowAnimations = [...document.querySelectorAll<HTMLElement>('.mahjong-hand button')].flatMap(e => e.getAnimations().filter(a => a.id.startsWith('mahjong-hand-reflow:')));
              for (const a of reflowAnimations) a.pause();
              const early = read();
              if (animation) {
                animation.pause();
                animation.currentTime = 0;
                await new Promise(r => requestAnimationFrame(r));
                early.flight = rect(flight);
                animation.currentTime = 115;
                await new Promise(r => requestAnimationFrame(r));
              }
              const middle = read();
              let end = null;
              if (animation) {
                animation.currentTime = 229.99;
                await new Promise(r => requestAnimationFrame(r));
                end = read();
                animation.currentTime = 115;
                await new Promise(r => requestAnimationFrame(r));
              }
              const reflows = [];
              for (const e of document.querySelectorAll<HTMLElement>('.mahjong-hand button')) {
                const a = e.getAnimations().find(a => a.id.startsWith('mahjong-hand-reflow:'));
                if (!a) continue;
                a.pause();
                a.currentTime = 0;
                await new Promise(r => requestAnimationFrame(r));
                const start = rect(e);
                a.currentTime = 125;
                await new Promise(r => requestAnimationFrame(r));
                const middle = rect(e);
                a.currentTime = 249.99;
                await new Promise(r => requestAnimationFrame(r));
                const end = rect(e);
                reflows.push({
                  sourceId: decodeURIComponent(a.id.slice('mahjong-hand-reflow:'.length)),
                  targetId: e.dataset.handInstanceId,
                  face: e.dataset.tileFace,
                  start,
                  middle,
                  end,
                  duration: a.effect?.getComputedTiming().duration
                });
                a.currentTime = 115;
              }
              return {
                early,
                middle,
                end,
                reflows,
                duration: animation?.effect?.getComputedTiming().duration,
                emphasis: target?.getAnimations().some(a => a.id.startsWith('mahjong-nuki-arrival:'))
              };
            });
            evidence.steps.push({
              source,
              beforeHand,
              engineBefore: oldGame,
              engineAfter: current.game,
              observed
            });
            writeFileSync(`${out}/${engine.name()}-${kind}-${viewport.width}.json`, JSON.stringify(evidence, null, 2));
            console.log(JSON.stringify({
              kind,
              engine: engine.name(),
              viewport,
              source,
              observed
            }));
            if (kind === 'duplicateNorthFallback') {
              assert.equal(observed.early.flightExists, false);
              assert.ok(observed.emphasis, 'ambiguous North must emphasize actual public target');
              assert.equal(observed.early.drawOpacity, '0');
            } else {
              assert.ok(observed.early.flightExists, 'accepted unique North must physically move from own source to tray');
              assert.equal(observed.early.targetVisibility, 'hidden');
              assert.equal(observed.early.drawOpacity, '0', 'replacement must wait until accepted transfer finishes');
              assert.equal(observed.early.drawArriving, false);
              assert.equal(observed.duration, 230);
              const start = observed.early.flight!;
              assert.ok(Math.hypot(start.x - source.x, start.y - source.y) < 2, 'flight must start at actual source');
              assert.ok(Math.hypot(observed.middle.flight!.x - start.x, observed.middle.flight!.y - start.y) > 2);
              const end = observed.end!.flight!,
                target = observed.early.target!;
              assert.ok(Math.hypot(end.x - target.x, end.y - target.y) < 2, 'flight must finish on actual public face');
              assert.ok(Math.hypot(observed.middle.flight!.x - target.x, observed.middle.flight!.y - target.y) > 2, 'midpoint must remain before target');
            }
            for (const r of observed.reflows) {
              const prior = beforeHand.find(t => t.id === r.sourceId);
              assert.ok(prior, 'reflow names actual previous occurrence');
              assert.equal(r.face, prior.face, 'reflow preserves exact red/ordinary face');
              assert.equal(r.duration, 250);
              assert.ok(!r.targetId?.startsWith('drawn:'), 'new replacement excluded from survivor mapping');
              assert.ok(Math.hypot(r.start!.x - prior.rect.x, r.start!.y - prior.rect.y) < 2, 'survivor starts at actual measured source');
              assert.ok(Math.hypot(r.end!.x - prior.rect.x, r.end!.y - prior.rect.y) > 2);
              assert.ok(Math.hypot(r.middle!.x - r.end!.x, r.middle!.y - r.end!.y) > 1);
            }
            if (kind === 'closedNorthWithDrawnSurvivor') {
              assert.ok(observed.reflows.some(r => r.sourceId.startsWith('drawn:') && r.face === 'p0'), 'prior red drawn tile must move into sorted closed hand');
            }
            if (engine === webkit && kind === 'closedNorthWithDrawnSurvivor' && step === 0) await page.screenshot({
              path: `${out}/webkit-midpoint-${viewport.width}.png`
            });
            await page.evaluate(async () => {
              const f = document.querySelector<HTMLElement>('[data-testid="mahjong-nuki-flight"]');
              for (const a of f?.getAnimations() ?? []) a.finish();
              for (const e of document.querySelectorAll<HTMLElement>('.mahjong-hand button')) for (const a of e.getAnimations()) if (a.id.startsWith('mahjong-hand-reflow:')) a.play();
              for (const e of document.querySelectorAll<HTMLElement>('[data-nuki-seat] .mahjong-tile')) for (const a of e.getAnimations()) if (a.id.startsWith('mahjong-nuki-arrival:')) a.finish();
            });
            await page.waitForTimeout(25);
            assert.ok(await page.locator('.mahjong-hand .is-draw-arriving').count(), 'held replacement entrance must start exactly on release');
            await page.waitForTimeout(280);
            assert.equal(await page.getByTestId('mahjong-nuki-flight').count(), 0);
            assert.equal(await page.locator('[data-nuki-seat="0"] .mahjong-nuki-tray__tiles > *').count(), step + 1);
            assert.equal(await page.locator('.is-draw-arriving').count(), 0);
          }
          if (kind === 'drawnNorth') {
            const second = new SanmaGame('east', names, fixture('p123456789s123z2', 'z4', ['s4']));
            let r = room(second);
            await page.evaluate(value => (window as any).nukiApi.render(value), r);
            await page.getByRole('button', {
              name: '拔北',
              exact: true
            }).click();
            second.respond(0, r.game!.decisionId, r.game!.choices.find(c => c.type === 'nuki')!.id);
            r = room(second, r.version + 1);
            await page.evaluate(value => (window as any).nukiApi.render(value), r);
            assert.equal(await page.getByTestId('mahjong-nuki-flight').count(), 1);
            const beforeQuiet = await page.getByTestId('mahjong-nuki-flight').getAttribute('data-motion-event');
            r = {
              ...r,
              version: r.version + 1
            };
            await page.evaluate(value => (window as any).nukiApi.render(value), r);
            assert.equal(await page.getByTestId('mahjong-nuki-flight').getAttribute('data-motion-event'), beforeQuiet);
            await page.locator('.mahjong-hand .is-drawn').click();
            assert.equal(await page.getByTestId('mahjong-nuki-flight').count(), 0);
            assert.equal(await page.locator('.is-nuki-held').count(), 0);
            assert.equal(await page.locator('.is-draw-arriving').count(), 0);
            assert.equal(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.mahjong-hand button')].flatMap(e => e.getAnimations().filter(a => a.id.startsWith('mahjong-hand-reflow:'))).length), 0);
            await page.waitForTimeout(240);
            assert.equal(await page.locator('.is-draw-arriving').count(), 0);
            evidence.inputCancelled = true;
            const natural = new SanmaGame('east', names, fixture('p123456789s123z2', 'z4', ['s4']));
            let naturalRoom = room(natural);
            await page.evaluate(value => (window as any).nukiApi.render(value), naturalRoom);
            await page.getByRole('button', {
              name: '拔北',
              exact: true
            }).click();
            natural.respond(0, naturalRoom.game!.decisionId, naturalRoom.game!.choices.find(c => c.type === 'nuki')!.id);
            naturalRoom = room(natural, naturalRoom.version + 1);
            await page.evaluate(value => (window as any).nukiApi.render(value), naturalRoom);
            naturalRoom = {
              ...naturalRoom,
              version: naturalRoom.version + 1
            };
            await page.evaluate(value => (window as any).nukiApi.render(value, {
              canAnimate: false
            }), naturalRoom);
            await page.waitForTimeout(260);
            assert.equal(await page.getByTestId('mahjong-nuki-flight').count(), 0);
            assert.equal(await page.locator('.is-nuki-held').count(), 0);
            assert.equal(await page.locator('.is-draw-arriving').count(), 1, 'natural flight release after quiet GET retains queued entrance');
            await page.waitForTimeout(240);
            assert.equal(await page.locator('.is-draw-arriving').count(), 0);
            evidence.naturalQuietRelease = true;
            for (const outcome of ['pass', 'ron']) {
              const rob = new SanmaGame('east', names, fixture('m19p222s444z11444', 's8', ['s9'], {
                1: 'p123456789s123z4'
              }));
              let robRoom = room(rob);
              await page.evaluate(value => (window as any).nukiApi.render(value), robRoom);
              const oldHand = robRoom.game!.hand;
              await page.getByRole('button', {
                name: '拔北',
                exact: true
              }).click();
              rob.respond(0, robRoom.game!.decisionId, robRoom.game!.choices.find(c => c.type === 'nuki')!.id);
              robRoom = room(rob, robRoom.version + 1);
              assert.equal(robRoom.game!.phase, 'nuki');
              assert.deepEqual(robRoom.game!.hand, oldHand);
              assert.equal(robRoom.game!.players[0].nuki, 0);
              await page.evaluate(value => (window as any).nukiApi.render(value), robRoom);
              assert.equal(await page.getByTestId('mahjong-nuki-flight').count(), 0);
              assert.equal(await page.locator('.is-nuki-held').count(), 0);
              const v = rob.view(1),
                response = v.choices.find(c => c.type === outcome);
              assert.ok(response, `real rob-nuki ${outcome} must be legal`);
              rob.respond(1, v.decisionId, response.id);
              robRoom = room(rob, robRoom.version + 1);
              await page.evaluate(value => (window as any).nukiApi.render(value), robRoom);
              if (outcome === 'pass') {
                assert.equal(robRoom.game!.players[0].nuki, 1);
                assert.ok(await page.evaluate(() => document.querySelector<HTMLElement>('[data-nuki-seat="0"] .mahjong-tile')?.getAnimations().some(a => a.id.startsWith('mahjong-nuki-arrival:'))));
                await page.waitForTimeout(500);
              } else {
                assert.ok(robRoom.game!.settlement);
                assert.equal(robRoom.game!.players[0].nuki, 0);
                assert.equal(await page.getByTestId('mahjong-nuki-flight').count(), 0);
                assert.equal(await page.locator('.is-nuki-held').count(), 0);
              }
              evidence[`robWindow${outcome}`] = {
                game: robRoom.game
              };
            }
            const opponent = new SanmaGame('east', names, fixture('p123456789s123z2', 'z4', ['s4']));
            let opponentRoom = room(opponent, 10, 1);
            await page.evaluate(value => (window as any).nukiApi.render(value), opponentRoom);
            const actor = opponent.view(0);
            opponent.respond(0, actor.decisionId, actor.choices.find(c => c.type === 'nuki')!.id);
            opponentRoom = room(opponent, 11, 1);
            await page.evaluate(value => (window as any).nukiApi.render(value), opponentRoom);
            assert.equal(await page.getByTestId('mahjong-nuki-flight').count(), 0);
            assert.ok(await page.evaluate(() => document.querySelector<HTMLElement>('[data-nuki-seat="0"] .mahjong-tile')?.getAnimations().some(a => a.id.startsWith('mahjong-nuki-arrival:'))));
            await page.waitForTimeout(260);
            assert.equal(await page.evaluate(() => document.querySelector<HTMLElement>('[data-nuki-seat="0"] .mahjong-tile')?.getAnimations().length), 0);
            evidence.opponentFinite = true;
          const resizeGame = new SanmaGame('east', names, fixture('p123456789s123z2', 'z4', ['s4']));
          let resizeRoom = room(resizeGame);
          await page.evaluate(value => (window as any).nukiApi.render(value), resizeRoom);
          await page.getByRole('button', { name: '拔北', exact: true }).click();
          resizeGame.respond(0, resizeRoom.game!.decisionId, resizeRoom.game!.choices.find(c => c.type === 'nuki')!.id);
          resizeRoom = room(resizeGame, resizeRoom.version + 1);
          await page.evaluate(value => (window as any).nukiApi.render(value), resizeRoom);
          assert.equal(await page.getByTestId('mahjong-nuki-flight').count(), 1);
          await page.evaluate(() => { const table = document.querySelector<HTMLElement>('[data-testid="mahjong-board"]')!; table.style.setProperty('width', `${table.getBoundingClientRect().width + 20}px`, 'important'); });
          await page.waitForTimeout(60);
          assert.equal(await page.getByTestId('mahjong-nuki-flight').count(), 0);
          assert.equal(await page.locator('.is-nuki-held').count(), 0);
          assert.equal(await page.locator('.is-draw-arriving').count(), 0);
          await page.waitForTimeout(240);
          assert.equal(await page.locator('.is-draw-arriving').count(), 0);
          evidence.tableOnlyResizeCancelled = true;

          }
          assert.deepEqual(errors, []);
          evidence.pageErrors = errors;
          writeFileSync(`${out}/${engine.name()}-${kind}-${viewport.width}.json`, JSON.stringify(evidence, null, 2));
          console.log(`PASS ${engine.name()} ${kind} ${viewport.width}`);
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}
