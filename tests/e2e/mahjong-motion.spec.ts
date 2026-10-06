import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { addSession, mutationHeaders, origin, userFixture } from './fixtures';
import type { MahjongResponse } from '../../src/modules/mahjong/types';

async function command(context:BrowserContext,input:object){
  const response=await context.request.post(new URL('/api/mahjong',origin()).toString(),{headers:mutationHeaders(),data:{...input,nonce:randomUUID()}});
  expect(response.ok(),await response.text()).toBe(true);
  return await response.json() as MahjongResponse;
}
async function watchFlights(page:Page){
  await page.evaluate(()=>{
    const result:{event:string;seat:string;source:string;targetPresent:boolean}[]=[];
    (window as any).observedDiscardFlights=result;
    const seen=new WeakSet<HTMLElement>();
    const observer=new MutationObserver(()=>{
      for(const node of document.querySelectorAll<HTMLElement>('[data-testid="mahjong-discard-flight"]')){
        const event=node.dataset.motionEvent!;
        if(seen.has(node))continue;
        seen.add(node);
        result.push({event,seat:node.dataset.motionSeat!,source:node.dataset.motionSource!,targetPresent:[...document.querySelectorAll<HTMLElement>('[data-discard-event-id]')].some(t=>t.dataset.discardEventId===event)});
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
  });
}

for(const variant of ['sanma','yonma'] as const)test(`${variant}真实Socket：本家确认后飞牌、另一真人收到同一河牌事件`,async({browser})=>{
  const contexts=await Promise.all([browser.newContext({viewport:{width:844,height:390}}),browser.newContext({viewport:{width:844,height:390}})]);
  const users=await Promise.all([userFixture('飞牌房主'),userFixture('飞牌牌友')]);
  await Promise.all(contexts.map((context,i)=>addSession(context,users[i].id)));
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  let roomId:string|undefined;
  try{
    const initial=await command(contexts[0],{action:'create',variant,mode:'east'});roomId=initial.room!.id;
    await command(contexts[1],{action:'join',code:initial.room!.code});
    await command(contexts[0],{action:'fill-bots',roomId});
    await command(contexts[0],{action:'ready',roomId,ready:true});
    await command(contexts[1],{action:'ready',roomId,ready:true});
    await Promise.all(pages.map(p=>p.goto('/mahjong')));
    await Promise.all(pages.map(p=>expect(p.locator('.mahjong-link-state.is-connected')).toBeVisible()));
    await Promise.all(pages.map(p=>p.route('**/api/mahjong',route=>route.request().method()==='GET'?route.abort('blockedbyclient'):route.continue())));
    await command(contexts[0],{action:'start',roomId});
    await Promise.all(pages.map(p=>expect(p.getByTestId('mahjong-board')).toBeVisible()));
    await Promise.all(pages.map(watchFlights));
    let actor=-1;
    await expect.poll(async()=>{
      for(let i=0;i<pages.length;i++){
        if(await pages[i].locator('[data-choice-type="discard"]:enabled').count()){actor=i;return true;}
        const pass=pages[i].locator('[data-choice-type="pass"]:enabled').first();
        if(await pass.count())await pass.click();
      }
      return false;
    },{timeout:30000}).toBe(true);
    const active=pages[actor],receiver=pages[1-actor];
    const seat=await active.locator('.mahjong-player.is-you').getAttribute('data-seat');
    expect(seat).not.toBeNull();
    const tile=active.locator('[data-choice-type="discard"]:enabled').first();
    const choiceId=await tile.getAttribute('data-choice-id');
    await tile.click();
    await expect(tile).toHaveAttribute('aria-pressed','true');
    await expect(active.getByTestId('mahjong-discard-flight')).toHaveCount(0);
    const response=active.waitForResponse(r=>r.url().endsWith('/api/mahjong')&&r.request().method()==='POST');
    await tile.click();
    const accepted=await response;expect(accepted.ok(),await accepted.text()).toBe(true);
    expect(accepted.request().postDataJSON()).toMatchObject({action:'respond',choiceId});
    await expect.poll(()=>active.evaluate(s=>(window as any).observedDiscardFlights.find((r:any)=>r.source==='own'&&r.seat===s),seat)).toBeTruthy();
    const own=await active.evaluate(s=>(window as any).observedDiscardFlights.find((r:any)=>r.source==='own'&&r.seat===s),seat);
    expect(own.targetPresent).toBe(true);
    await expect.poll(()=>receiver.evaluate(e=>(window as any).observedDiscardFlights.find((r:any)=>r.event===e),own.event)).toBeTruthy();
    const received=await receiver.evaluate(e=>(window as any).observedDiscardFlights.find((r:any)=>r.event===e),own.event);
    expect(received).toMatchObject({source:'opponent',seat,targetPresent:true});
    for(const p of pages)expect(await p.evaluate(e=>(window as any).observedDiscardFlights.filter((r:any)=>r.event===e).length,own.event)).toBe(1);
  }finally{
    if(roomId)await command(contexts[0],{action:'finish',roomId});
    await Promise.all(contexts.map(c=>c.close()));
  }
});
