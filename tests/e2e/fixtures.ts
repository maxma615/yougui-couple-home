import {randomUUID} from 'node:crypto';
import {type Browser,type BrowserContext,expect} from '@playwright/test';
import {pool} from '../../src/lib/db';
import {hashPassword} from '../../src/modules/auth/password';
import {createSession,SESSION_COOKIE_NAME} from '../../src/modules/auth/session';
import {createHome} from '../../src/modules/home/service';

export const origin=()=>process.env.E2E_ORIGIN!;
export async function userFixture(name='小满'){
  const id=randomUUID(),email=`e2e-${id}@example.test`,password=`Test-only-${randomUUID()}!`;
  await pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,email,name,await hashPassword(password)]);
  return {id,email,password,displayName:name};
}
export async function addSession(context:BrowserContext,id:string){
  const session=await createSession(id);
  await context.addCookies([{name:SESSION_COOKIE_NAME,value:session.token,url:origin(),httpOnly:true,sameSite:'Lax',secure:false}]);
  return session;
}
export async function pairedFixture(browser:Browser){
  const a=await userFixture('小满'),b=await userFixture('阿夏');
  const home=await createHome(a.id,{name:'晴天小屋',startDate:'2020-05-20',displayName:a.displayName});
  await pool.query('INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,2)',[home.id,b.id]);
  const contextA=await browser.newContext(),contextB=await browser.newContext();
  await addSession(contextA,a.id);await addSession(contextB,b.id);
  return {a,b,home,contextA,contextB,async cleanup(){await contextA.close();await contextB.close();}};
}
export const mutationHeaders=()=>({'Origin':origin(),'Content-Type':'application/json'});
export async function checkNoOverflow(page:import('@playwright/test').Page){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
}
