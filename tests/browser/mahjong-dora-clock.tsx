import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {chromium, webkit} from '@playwright/test';
import {doraKanSequence} from '../fixtures/mahjong-dora-game';
const out = '.local/audit/dora-clock-browser-' + Date.now(); mkdirSync(out, {recursive: true});
const cssFiles = [...readFileSync('src/app/mahjong/page.tsx', 'utf8').matchAll(/import "\.\/(mahjong[^"\n]*\.css)";/g)].map(m => 'src/app/mahjong/' + m[1]);
const files = ['tests/browser/mahjong-dora-clock.tsx', 'tests/fixtures/mahjong-dora-game.ts',
  'src/components/mahjong/mahjong-client.tsx', 'src/components/mahjong/dora-sheen-clock.ts',
  'src/components/mahjong/use-dora-sheen-clock.ts', ...cssFiles];
const hashes = () => Object.fromEntries(files.map(f => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]));
const sources = hashes();
const bundle = (await build({stdin: {contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {GameRoom} from './src/components/mahjong/mahjong-client';import {documentDoraSheenSnapshot} from './src/components/mahjong/dora-sheen-clock';const root=createRoot(document.getElementById('root'));window.renderRoom=(room,connected=true)=>flushSync(()=>root.render(<main className="mahjong-page"><div className="mahjong-shell"><GameRoom room={room} ownSeat={0} connected={connected} host={false} busy={false} motionCanAnimate onChoice={()=>{throw Error('observation must not submit')}} onFinish={()=>{}} onRematch={()=>{}} onLeave={()=>{}}/></div></main>));window.clockSnapshot=()=>documentDoraSheenSnapshot(document);window.dispose=()=>root.unmount();`, resolveDir: process.cwd(), loader: 'tsx'}, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: {'process.env.NODE_ENV': '"development"'}})).outputFiles[0].text;
const results: unknown[] = [];
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const variant of ['sanma', 'yonma'] as const) for (const viewport of [{width: 667, height: 375}, {width: 1440, height: 810}]) {
      const sequence = doraKanSequence(variant), context = await browser.newContext({viewport}), page = await context.newPage();
      const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
      await page.route('http://dora-clock.local/**', route => {
        const p = new URL(route.request().url()).pathname;
        if (p.startsWith('/fonts/') || p.startsWith('/images/')) return route.fulfill({body: readFileSync('public' + p), contentType: p.endsWith('.woff2') ? 'font/woff2' : p.endsWith('.svg') ? 'image/svg+xml' : 'image/webp'});
        return route.fulfill({contentType: 'text/html', body: `<style>*{box-sizing:border-box}body{margin:0}${cssFiles.map(f => readFileSync(f, 'utf8')).join('\n')}</style><div id="root"></div><script>globalThis.__name=(t,v)=>Object.defineProperty(t,'name',{value:v,configurable:true});globalThis.process={env:{NODE_ENV:'development'}};${bundle}</script>`});
      });
      try {
        await page.goto('http://dora-clock.local/'); await page.emulateMedia({reducedMotion: 'no-preference'});
        await page.evaluate(r => (window as any).renderRoom(r), sequence[0]);
        await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('img.mahjong-tile__art')].every(i => i.complete && i.naturalWidth === 300));
        await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(650);
        const before = await page.locator('.mahjong-hand [data-tile-face="z6"]').first().evaluate(e => {
          const animation = e.getAnimations({subtree: true}).find(a => (a as CSSAnimation).animationName === 'mahjong-dora-sheen');
          const clock = (window as any).clockSnapshot();
          return {phase: clock?.elapsed ?? Number(animation?.currentTime), offset: clock?.offset,
            at: clock?.timestamp ?? performance.now(), position: getComputedStyle(e, '::before').backgroundPosition};
        });
        assert(before.phase > 300, 'the existing real bonus must already be moving before the kan');
        for (const frame of sequence.slice(1)) await page.evaluate(r => (window as any).renderRoom(r), frame);
        const after = await page.evaluate(async () => {
          await new Promise(requestAnimationFrame);
          const green = document.querySelector('.mahjong-hand [data-tile-face="z6"]')!, red = document.querySelector('.mahjong-hand [data-tile-face="z7"]')!;
          const animation = green.getAnimations({subtree: true}).find(a => (a as CSSAnimation).animationName === 'mahjong-dora-sheen');
          const clock = (window as any).clockSnapshot();
          return {phase: clock?.elapsed ?? Number(animation?.currentTime), offset: clock?.offset, at: clock?.timestamp ?? performance.now(),
            green: getComputedStyle(green, '::before').backgroundPosition, red: getComputedStyle(red, '::before').backgroundPosition,
            greenContent: getComputedStyle(green, '::before').content, redContent: getComputedStyle(red, '::before').content};
        });
        writeFileSync(out + `/${engine.name()}-${variant}-${viewport.width}-phase.json`, JSON.stringify({before, after}, null, 2));
        assert(Math.abs(after.phase - before.phase - (after.at - before.at)) < 1e-6,
          'a real kan and hand reflow must preserve the existing shared bonus clock instead of restarting it');
        assert.notEqual(after.greenContent, 'none'); assert.notEqual(after.redContent, 'none');
        assert.equal(after.green, after.red, 'newly indicated and existing bonus faces must use the same UV phase');
        const advancing = await page.evaluate(async () => {
          const face = document.querySelector('.mahjong-hand [data-tile-face="z6"]')!;
          const first = (window as any).clockSnapshot(), firstPosition = getComputedStyle(face, '::before').backgroundPosition;
          await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
          return {first, second: (window as any).clockSnapshot(), firstPosition, secondPosition: getComputedStyle(face, '::before').backgroundPosition,
            offset: getComputedStyle(document.documentElement).getPropertyValue('--mahjong-dora-offset')};
        });
        assert(advancing.first && advancing.second); assert(advancing.second.elapsed > advancing.first.elapsed);
        assert.equal(Number(advancing.offset), advancing.second.offset); assert.equal(advancing.second.subscribers, 1);
        assert.notEqual(advancing.firstPosition, advancing.secondPosition, 'the actual painted UV must move with the clock');
        assert(Math.abs(parseFloat(advancing.secondPosition.split(' ')[1]) - advancing.second.offset * 125) < .001,
          'the actual CSS texture translation must implement the reference vertical UV offset');
        await page.screenshot({path: out + `/${engine.name()}-${variant}-${viewport.width}-shared.png`});
        await page.emulateMedia({reducedMotion: 'reduce'}); await page.waitForTimeout(60);
        const paused = await page.evaluate(() => (window as any).clockSnapshot()); await page.waitForTimeout(100);
        assert.deepEqual(await page.evaluate(() => (window as any).clockSnapshot()), paused); assert.equal(paused.running, false);
        await page.emulateMedia({reducedMotion: 'no-preference'});
        await page.waitForFunction(elapsed => { const clock = (window as any).clockSnapshot(); return clock?.running && clock.elapsed > elapsed; }, paused.elapsed, {timeout: 2000});
        await page.evaluate(r => (window as any).renderRoom(r, false), sequence.at(-1)); await page.waitForTimeout(60);
        assert.equal((await page.evaluate(() => (window as any).clockSnapshot())).running, false);
        await page.evaluate(() => (window as any).dispose()); assert.equal((await page.evaluate(() => (window as any).clockSnapshot())).subscribers, 0);
        assert.deepEqual(errors, []); results.push({engine: engine.name(), variant, viewport, before, after, advancing, paused});
        console.log('PASS', engine.name(), variant, viewport.width, 'shared phase, actual kan, reduced motion, disconnect and disposal');
      } catch (error) { await page.screenshot({path: out + `/${engine.name()}-${variant}-${viewport.width}-failure.png`}); throw error; }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
assert.deepEqual(hashes(), sources); assert.equal(results.length, 8);
writeFileSync(out + '/proof.json', JSON.stringify({sources, results}, null, 2)); console.log('PASS8 shared dora clock', out);
