import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {createTestDatabase,type TestDatabase} from '../helpers/database';
import {runMigrations} from '../../src/cli/migrate';
import {createAnniversaryService} from '../../src/modules/anniversaries/service';
import {createTodoService} from '../../src/modules/todos/service';

describe('shared life records on real PostgreSQL',()=>{
  let database:TestDatabase;
  const a={homeId:randomUUID(),userId:randomUUID()},b={homeId:randomUUID(),userId:randomUUID()};
  let anniversaries:ReturnType<typeof createAnniversaryService>,todos:ReturnType<typeof createTodoService>;
  beforeAll(async()=>{
    database=await createTestDatabase();await runMigrations(database.pool);
    for(const [index,ctx] of [a,b].entries()) {
      await database.pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[ctx.userId,`test${index}@example.test`,'测试成员','not-a-real-password']);
      await database.pool.query('INSERT INTO homes(id,name,start_date) VALUES($1,$2,$3)',[ctx.homeId,'测试小屋','2020-01-01']);
      await database.pool.query('INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,1)',[ctx.homeId,ctx.userId]);
    }
    anniversaries=createAnniversaryService(database.pool);todos=createTodoService(database.pool);
  });
  afterAll(async()=>database?.cleanup());
  it('keeps calendar dates, scopes reads and protects edits/deletes with versions',async()=>{
    const row=await anniversaries.create(a,{title:'认识的那一天',date:'2024-02-29',note:'值得记住',yearly:true,homeId:b.homeId});
    expect(row.date).toBe('2024-02-29');expect(row.version).toBe(1);
    expect((await anniversaries.list(b)).length).toBe(0);
    await expect(anniversaries.get(b,row.id)).rejects.toMatchObject({status:404});
    await expect(anniversaries.update(b,row.id,{title:'侵入',version:1})).rejects.toMatchObject({status:404});
    const edit=await anniversaries.update(a,row.id,{title:'我们的纪念日',version:1});
    expect(edit.version).toBe(2);expect(edit.updatedBy).toBe(a.userId);
    await expect(anniversaries.update(a,row.id,{title:'过期覆盖',version:1})).rejects.toMatchObject({status:409,current:{title:'我们的纪念日',version:2}});
    await expect(anniversaries.remove(a,row.id,1)).rejects.toMatchObject({status:409});
    await anniversaries.remove(a,row.id,2);
    await expect(anniversaries.get(a,row.id)).rejects.toMatchObject({status:404});
  });
  it('rejects blank titles, impossible dates and outsiders as todo owners',async()=>{
    await expect(anniversaries.create(a,{title:'  ',date:'2023-02-29',yearly:true})).rejects.toMatchObject({status:422});
    await expect(todos.create(a,{title:'采购',assigneeId:b.userId})).rejects.toMatchObject({status:422});
    await expect(todos.create(a,{title:'采购',assigneeId:randomUUID()})).rejects.toMatchObject({status:422});
  });
  it('records one completion effect and clears completion time when reopened',async()=>{
    const row=await todos.create(a,{title:'一起去公园',description:'周末',assigneeId:null,dueDate:'2026-10-01'});
    expect(row.completed).toBe(false);expect(row.completedAt).toBe(null);
    const complete=await todos.update(a,row.id,{completed:true,version:1});
    expect(complete.completedAt).toMatch(/^\d{4}-/);
    await expect(todos.update(a,row.id,{completed:true,version:1})).rejects.toMatchObject({status:409});
    const noOp=await todos.update(a,row.id,{completed:true,version:2});
    expect(noOp.version).toBe(2);expect(noOp.completedAt).toBe(complete.completedAt);
    const reopen=await todos.update(a,row.id,{completed:false,version:2});
    expect(reopen.version).toBe(3);expect(reopen.completedAt).toBe(null);
    const {rows}=await database.pool.query('SELECT count(*)::int AS n FROM home_events WHERE resource_id=$1',[row.id]);
    expect(rows[0].n).toBe(3);
  });
});
