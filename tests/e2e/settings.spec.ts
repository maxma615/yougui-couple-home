import { expect, test } from '@playwright/test';
import { addSession, checkNoOverflow, mutationHeaders, pairedFixture } from './fixtures';

test('改密只在弹窗内进行，错误保留输入，成功轮换会话并撤销旧登录', async ({browser,page}) => {
 const pair=await pairedFixture(browser);await addSession(page.context(),pair.a.id);
 try {
  await page.goto('/settings');
  await expect(page.getByRole('heading',{name:/我们的\s*空间/})).toBeVisible();
  await expect(page.getByLabel('当前密码',{exact:true})).toHaveCount(0);
  const trigger=page.getByRole('button',{name:'修改密码',exact:true});await trigger.click();
  const dialog=page.getByRole('dialog',{name:'修改密码',exact:true});await expect(dialog).toBeVisible();
  await page.getByLabel('当前密码',{exact:true}).fill('wrong-password');
  await page.getByLabel('新密码',{exact:true}).fill('New-private-password-2026!');
  await page.getByLabel('确认新密码',{exact:true}).fill('New-private-password-2026!');
  await dialog.getByRole('button',{name:'保存新密码'}).click();
  await expect(dialog.getByText('当前密码错误',{exact:false}).first()).toBeVisible();
  await expect(page.getByLabel('新密码',{exact:true})).toHaveValue('New-private-password-2026!');
  await checkNoOverflow(page);
  await page.getByLabel('当前密码',{exact:true}).fill(pair.a.password);
  await dialog.getByRole('button',{name:'保存新密码'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('密码已修改。')).toBeVisible();
  expect((await pair.contextA.request.get('/api/session')).status()).toBe(401);
  expect((await page.request.get('/api/session')).status()).toBe(200);
  await trigger.click();await expect(page.getByLabel('当前密码',{exact:true})).toHaveValue('');
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
 } finally {await pair.cleanup();}
});

test('成员按本人身份展示，弹窗草稿遇到并发更新仍保留',async({browser,page},testInfo)=>{
 const pair=await pairedFixture(browser);await addSession(page.context(),pair.b.id);
 try {
  await page.goto('/settings');
  await expect(page.getByText('第一位成员',{exact:true})).toHaveCount(0);
  await expect(page.locator('[data-member="me"]')).toContainText('阿夏');
  await expect(page.locator('[data-member="partner"]')).toContainText('小满');
  await page.getByRole('button',{name:'编辑我的昵称'}).click();
  const dialog=page.getByRole('dialog',{name:'编辑我的昵称'});
  await page.getByLabel('我的昵称',{exact:true}).fill('阿夏的草稿');
  const before=await pair.contextA.request.get('/api/home');const home=await before.json();
  const updated=await pair.contextA.request.patch('/api/home',{headers:mutationHeaders(),data:{...home,name:'另一方修改的空间',version:home.version}});expect(updated.status()).toBe(200);
  await dialog.getByRole('button',{name:'保存修改',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:'内容有更新冲突'})).toBeVisible();
  await expect(page.getByLabel('我的昵称',{exact:true})).toHaveValue('阿夏的草稿');
  await dialog.getByRole('button',{name:'基于最新内容重试'}).click();
  await expect(dialog).toHaveCount(0);
  const after=await (await pair.contextA.request.get('/api/home')).json();
  expect(after.name).toBe('另一方修改的空间');expect(after.members.find((x:{id:string})=>x.id===pair.b.id).displayName).toBe('阿夏的草稿');
  await checkNoOverflow(page);await page.screenshot({path:testInfo.outputPath('settings.png'),fullPage:true,animations:'disabled'});
 }finally{await pair.cleanup();}
});

test('弹窗锁定焦点、取消不写入，减少动态效果偏好生效',async({browser,page})=>{
 const pair=await pairedFixture(browser);await addSession(page.context(),pair.a.id);
 try {
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/settings');
  await expect(page.getByRole('heading',{name:/我们的\s*空间/})).toBeVisible();
  const trigger=page.getByRole('button',{name:'编辑空间资料'});await trigger.click();
  const dialog=page.getByRole('dialog',{name:'编辑空间资料'});await expect(dialog).toBeVisible();
  await page.getByLabel('空间名称',{exact:true}).fill('不应保存的名字');
  for(let i=0;i<8;i++){await page.keyboard.press('Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);}
  await expect.poll(()=>dialog.evaluate(e=>parseFloat(getComputedStyle(e).animationDuration))).toBeLessThan(0.001);
  await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
  const home=await(await page.request.get('/api/home')).json();expect(home.name).toBe(pair.home.name);
 }finally{await pair.cleanup();}
});

test('昵称可清空，实时更新不覆盖空草稿，必填失败保留空白',async({browser,page})=>{
 const pair=await pairedFixture(browser);await addSession(page.context(),pair.b.id);
 try {
  await page.goto('/settings');
  await expect(page.getByRole('heading',{name:/我们的\s*空间/})).toBeVisible();
  await page.getByRole('button',{name:'编辑我的昵称'}).click();
  const dialog=page.getByRole('dialog',{name:'编辑我的昵称'});
  const nickname=page.getByLabel('我的昵称',{exact:true});
  await nickname.fill('');
  const response=await pair.contextA.request.get('/api/home');const home=await response.json();
  const updated=await pair.contextA.request.patch('/api/home',{headers:mutationHeaders(),data:{...home,members:home.members.map((member:{id:string;displayName:string})=>member.id===pair.b.id?{...member,displayName:'另一方刚更新'}:member)}});
  expect(updated.status()).toBe(200);
  await expect(page.locator('[data-member="me"] h3')).toHaveText('另一方刚更新');
  await expect(nickname).toHaveValue('');
  await dialog.getByRole('button',{name:'保存修改',exact:true}).click();
  await expect(dialog.getByText('显示名称不能为空且最多 60 个字符',{exact:true})).toBeVisible();
  await expect(nickname).toHaveValue('');
  await expect(nickname).toHaveAttribute('aria-invalid','true');
 }finally{await pair.cleanup();}
});

test('改密请求进行中会锁定关闭并阻止重复提交',async({browser,page})=>{
 const pair=await pairedFixture(browser);await addSession(page.context(),pair.a.id);
 let releaseRequest=()=>{};
 try {
  await page.goto('/settings');
  await page.getByRole('button',{name:'修改密码',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'修改密码',exact:true});
  await page.getByLabel('当前密码',{exact:true}).fill(pair.a.password);
  await page.getByLabel('新密码',{exact:true}).fill('New-private-password-2026!');
  await page.getByLabel('确认新密码',{exact:true}).fill('New-private-password-2026!');
  let attempts=0;
  let markStarted=()=>{};
  const started=new Promise<void>(resolve=>{markStarted=resolve;});
  const blocked=new Promise<void>(resolve=>{releaseRequest=resolve;});
  await page.route('**/api/auth/password',async route=>{
   attempts+=1;markStarted();await blocked;
   await route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({error:{code:'validation_failed',message:'请检查输入内容',fields:{currentPassword:'当前密码错误'}}})});
  });
  const submit=dialog.locator('form').getByRole('button');
  await submit.click();await started;
  await expect(dialog).toHaveAttribute('aria-busy','true');
  await expect(dialog.getByRole('button',{name:'关闭弹窗'})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'取消'})).toBeDisabled();
  await expect(submit).toBeDisabled();
  await dialog.locator('form').evaluate((form:HTMLFormElement)=>{form.requestSubmit();form.requestSubmit();});
  await expect.poll(()=>attempts).toBe(1);
  releaseRequest();
  await expect(dialog.getByText('当前密码错误',{exact:true})).toBeVisible();
 }finally{releaseRequest();await pair.cleanup();}
});

test('资料保存期间锁定字段，失败后恢复编辑并保留提交值',async({browser,page})=>{
 const pair=await pairedFixture(browser);await addSession(page.context(),pair.a.id);
 let release=()=>{};
 try {
  await page.goto('/settings');await page.getByRole('button',{name:'编辑我的昵称'}).click();
  const dialog=page.getByRole('dialog',{name:'编辑我的昵称'});
  const nickname=dialog.getByLabel('我的昵称',{exact:true});await nickname.fill('这次提交的昵称');
  let started=()=>{};const entered=new Promise<void>(resolve=>{started=resolve;});const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/home',async route=>{
   if(route.request().method()!=='PATCH')return route.continue();
   started();await held;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'TEST_FAILED',message:'暂时无法保存'}})});
  });
  await dialog.locator('button').filter({hasText:'保存修改'}).click();await entered;
  await expect(nickname).toBeDisabled();
  release();await expect(nickname).toBeEnabled();await expect(nickname).toHaveValue('这次提交的昵称');
  await expect(dialog.getByRole('alert')).toContainText('暂时无法保存');
 }finally{release();await pair.cleanup();}
});
