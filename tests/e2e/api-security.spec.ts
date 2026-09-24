import {test,expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {pairedFixture,mutationHeaders,origin,userFixture,addSession} from './fixtures';

test('HTTP permissions and CSRF matrix covers every resource boundary',async({browser,request})=>{
  const pair=await pairedFixture(browser),outsider=await userFixture('其他成员');
  const other=await browser.newContext();await addSession(other,outsider.id);
  const {createHome}=await import('../../src/modules/home/service');
  await createHome(outsider.id,{name:'另一个小屋',startDate:'2020-01-01',displayName:outsider.displayName});
  try{
    for(const route of ['/api/session','/api/home','/api/anniversaries','/api/todos','/api/moments','/api/calendar','/api/events',`/api/photos/${randomUUID()}`]){
      expect((await request.get(route)).status(),route).toBe(401);
    }
    const definitions=[
      {path:'anniversaries',body:{title:'纪念日',date:'2024-02-29',note:'秘密文字',yearly:true}},
      {path:'todos',body:{title:'共同采购',description:'秘密文字',completed:false}},
      {path:'moments',body:{title:'一起散步',date:'2026-09-22',body:'秘密文字'}},
      {path:'calendar',body:{title:'跨月出游',start:'2026-09-30',end:'2026-10-02',allDay:true,location:'秘密地点',description:'秘密文字'}},
    ];
    for(const entry of definitions){
      const created=await pair.contextA.request.post(`/api/${entry.path}`,{headers:mutationHeaders(),data:{...entry.body,homeId:randomUUID()}});
      expect(created.status(),await created.text()).toBe(201);
      const row=await created.json();
      expect((await pair.contextB.request.get(`/api/${entry.path}/${row.id}`)).status()).toBe(200);
      expect((await other.request.get(`/api/${entry.path}/${row.id}`)).status()).toBe(404);
      expect((await other.request.patch(`/api/${entry.path}/${row.id}`,{headers:mutationHeaders(),data:{title:'非法修改',version:1}})).status()).toBe(404);
      expect((await other.request.delete(`/api/${entry.path}/${row.id}`,{headers:mutationHeaders(),data:{version:1}})).status()).toBe(404);
      expect((await pair.contextA.request.patch(`/api/${entry.path}/${row.id}`,{headers:{...mutationHeaders(),Origin:'https://attacker.invalid'},data:{title:'跨站修改',version:1}})).status()).toBe(403);
      const changed=await pair.contextA.request.patch(`/api/${entry.path}/${row.id}`,{headers:mutationHeaders(),data:{title:'先保存的内容',version:1}});
      expect(changed.status()).toBe(200);
      const stale=await pair.contextB.request.patch(`/api/${entry.path}/${row.id}`,{headers:mutationHeaders(),data:{title:'后来覆盖',version:1}});
      expect(stale.status()).toBe(409);expect((await stale.json()).error.current.title).toBe('先保存的内容');
      expect((await pair.contextB.request.delete(`/api/${entry.path}/${row.id}`,{headers:mutationHeaders(),data:{version:1}})).status()).toBe(409);
      expect((await pair.contextB.request.delete(`/api/${entry.path}/${row.id}`,{headers:mutationHeaders(),data:{version:2}})).status()).toBe(200);
    }
    for(const path of ['/api/auth/login','/api/auth/logout','/api/auth/password','/api/home','/api/invites']){
      const result=await pair.contextA.request.post(path,{headers:{...mutationHeaders(),Origin:'https://attacker.invalid'},data:{}});
      expect(result.status(),path).toBe(403);
    }
    const malformed=await request.get('/api/session',{headers:{Cookie:'couple_home_session=%'}});
    expect(malformed.status()).toBe(401);
    expect(await malformed.text()).not.toContain('URIError');
    const noHomeUser=await userFixture(),noHome=await browser.newContext();
    await addSession(noHome,noHomeUser.id);
    expect((await noHome.request.get('/api/session')).status()).toBe(200);
    expect((await noHome.request.get('/api/todos')).status()).toBe(403);
    await noHome.close();
  }finally{await pair.cleanup();await other.close();}
});

test('SSE is authenticated, replays committed changes and closes after session revocation',async({browser})=>{
  const pair=await pairedFixture(browser);
  const cookies=await pair.contextB.cookies(origin());
  const cookie=cookies.map(value=>`${value.name}=${value.value}`).join('; ');
  const abort=new AbortController();
  try{
    const response=await fetch(`${origin()}/api/events`,{headers:{Cookie:cookie},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(30000)])});
    expect(response.status).toBe(200);
    const reader=response.body!.getReader(),decoder=new TextDecoder();
    let text='';
    while(!text.includes('event: reset'))text+=decoder.decode((await reader.read()).value);
    const created=await pair.contextA.request.post('/api/todos',{headers:mutationHeaders(),data:{title:'应该自动出现'}});
    const row=await created.json();
    while(!text.includes(row.id))text+=decoder.decode((await reader.read()).value);
    expect(text).not.toContain('应该自动出现');
    expect(text).not.toContain(pair.a.email);
    expect(text).toContain('"type":"todo"');
    await pair.contextB.request.post('/api/auth/logout',{headers:mutationHeaders(),data:{}});
    let closed=false;
    for(let i=0;i<5;i++){const chunk=await reader.read();if(chunk.done){closed=true;break;}}
    expect(closed).toBe(true);
  }finally{abort.abort();await pair.cleanup();}
});

test('login, invitation and password endpoints enforce their account rate limits', async ({browser,request}) => {
  const pair = await pairedFixture(browser);
  const email = `missing-${randomUUID()}@example.test`;
  try {
    for (let attempt=0;attempt<11;attempt++) {
      const response=await request.post('/api/auth/login',{headers:mutationHeaders(),data:{email,password:'wrong-password'}});
      expect(response.status()).toBe(attempt<10?401:429);
    }
    for (let attempt=0;attempt<11;attempt++) {
      const response=await request.post(`/api/invites/${randomUUID()}`,{headers:mutationHeaders(),data:{email,displayName:'无效邀请',password:'valid-format-password'}});
      expect(response.status()).toBe(attempt<10?404:429);
    }
    for (let attempt=0;attempt<11;attempt++) {
      const response=await pair.contextA.request.post('/api/auth/password',{headers:mutationHeaders(),data:{currentPassword:'wrong-password',newPassword:'valid-new-password'}});
      expect(response.status()).toBe(attempt<10?401:429);
    }
  } finally { await pair.cleanup(); }
});
