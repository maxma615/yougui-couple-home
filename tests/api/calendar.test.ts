import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/database';
import { runMigrations } from '../../src/cli/migrate';
import { createCalendarService } from '../../src/modules/calendar/service';
import { createCalendarRoutes } from '../../src/app/api/calendar/handlers';
import { createSession, sessionCookieHeader } from '../../src/modules/auth/session';
import { loadConfig } from '../../src/lib/config';
import { WRITE_TRANSACTION_LOCK_KEY } from '../../src/lib/db';

describe('calendar on real PostgreSQL',()=>{
  let database:TestDatabase;
  let service:ReturnType<typeof createCalendarService>;
  let routes:ReturnType<typeof createCalendarRoutes>;
  const a={homeId:randomUUID(),userId:randomUUID()},b={homeId:randomUUID(),userId:randomUUID()};
  const partner={homeId:a.homeId,userId:randomUUID()};
  let cookieA:string,cookieB:string;
  const input={title:'跨月旅行',allDay:true,start:'2026-09-30',end:'2026-10-02',location:'海边',description:'一起出发'};
  beforeAll(async()=>{
    database=await createTestDatabase();await runMigrations(database.pool);
    for(const [i,ctx] of [a,b].entries()) {
      await database.pool.query('INSERT INTO users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[ctx.userId,`calendar${i}@example.test`,'测试成员','not-real']);
      await database.pool.query('INSERT INTO homes(id,name,start_date) VALUES($1,$2,$3)',[ctx.homeId,'日历小屋','2020-01-01']);
      await database.pool.query('INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,1)',[ctx.homeId,ctx.userId]);
    }
    await database.pool.query("INSERT INTO users(id,email,display_name,password_hash) VALUES($1,'calendar-partner@example.test','第二成员','not-real')",[partner.userId]);
    await database.pool.query('INSERT INTO home_members(home_id,user_id,slot) VALUES($1,$2,2)',[a.homeId,partner.userId]);
    cookieA=sessionCookieHeader((await createSession(a.userId,database.pool)).token);
    cookieB=sessionCookieHeader((await createSession(b.userId,database.pool)).token);
    service=createCalendarService(database.pool);routes=createCalendarRoutes(database.pool);
  });
  afterAll(async()=>database?.cleanup());
  it('persists inclusive dates, ignores spoofed home and scopes every operation',async()=>{
    const row=await service.create(a,{...input,homeId:b.homeId});
    expect(row).toMatchObject({...input,version:1,createdBy:a.userId,updatedBy:a.userId});
    expect(row).not.toHaveProperty('homeId');expect(row).not.toHaveProperty('startDate');
    expect(await service.list(b)).toEqual([]);
    await expect(service.get(b,row.id)).rejects.toMatchObject({status:404});
    await expect(service.update(b,row.id,{title:'入侵',version:1})).rejects.toMatchObject({status:404});
    await expect(service.remove(b,row.id,1)).rejects.toMatchObject({status:404});
    expect(await service.get(a,row.id)).toEqual(row);
  });
  it('serializes conflicting edits, returns public current and creates exactly one event per write',async()=>{
    const row=await service.create(a,input);
    const results=await Promise.allSettled([service.update(a,row.id,{title:'A',version:1}),service.update(partner,row.id,{title:'B',version:1})]);
    expect(results.map(r=>r.status).sort()).toEqual(['fulfilled','rejected']);
    const current=await service.get(a,row.id);
    expect(current.version).toBe(2);
    expect(current.createdBy).toBe(a.userId);
    expect(current.updatedBy).toBe(current.title==='A'?a.userId:partner.userId);
    const failure=results.find(r=>r.status==='rejected') as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({status:409,current});
    await expect(service.remove(a,row.id,1)).rejects.toMatchObject({status:409,current});
    const unchanged=await service.update(a,row.id,{title:current.title,version:2});
    expect(unchanged.version).toBe(2);
    await service.remove(a,row.id,2);
    await expect(service.get(a,row.id)).rejects.toMatchObject({status:404});
    const events=await database.pool.query('SELECT action,version,resource_type FROM home_events WHERE resource_id=$1 ORDER BY id',[row.id]);
    expect(events.rows).toEqual([{action:'created',version:1,resource_type:'calendar'},{action:'updated',version:2,resource_type:'calendar'},{action:'deleted',version:3,resource_type:'calendar'}]);
  });
  it('normalizes offset instants and clears inactive columns when changing event type',async()=>{
    const row=await service.create(a,{...input,allDay:false,start:'2026-11-01T01:30:00-04:00',end:'2026-11-01T01:15:00-05:00'});
    expect(row.start).toBe('2026-11-01T05:30:00.000Z');expect(row.end).toBe('2026-11-01T06:15:00.000Z');
    const all=await service.update(a,row.id,{allDay:true,start:'2024-02-29',end:'2024-02-29',version:1});
    expect(all.start).toBe('2024-02-29');
    let columns=await database.pool.query('SELECT start_at,end_at,start_date::text,end_date::text FROM calendar_events WHERE id=$1',[row.id]);
    expect(columns.rows[0]).toEqual({start_at:null,end_at:null,start_date:'2024-02-29',end_date:'2024-02-29'});
    await service.update(a,row.id,{allDay:false,start:'2026-09-23T00:00:00Z',end:'2026-09-23T00:00:00Z',version:2});
    columns=await database.pool.query('SELECT start_date,end_date FROM calendar_events WHERE id=$1',[row.id]);
    expect(columns.rows[0]).toEqual({start_date:null,end_date:null});
  });
  it.each([{title:' '},{start:'2026-02-30'},{end:'2026-09-29'},{allDay:false,start:'2026-09-23T10:00',end:'2026-09-23T11:00'},{allDay:false,start:'2026-09-23T11:00:00Z',end:'2026-09-23T10:00:00Z'}])('rejects invalid calendar input %j',async patch=>{
    await expect(service.create(a,{...input,...patch})).rejects.toMatchObject({status:422});
  });
  it('enforces date/time shape even for a direct SQL write',async()=>{
    await expect(database.pool.query("INSERT INTO calendar_events(home_id,title,all_day,start_date,end_date,start_at,end_at,created_by,updated_by) VALUES($1,'bad',true,'2026-09-23','2026-09-23',now(),now(),$2,$2)",[a.homeId,a.userId])).rejects.toMatchObject({code:'23514'});
  });
  it('rejects out-of-range calendar dates instead of exposing unrenderable years',async()=>{
    await expect(service.create(a,{...input,start:'0001-01-01',end:'0001-01-01'})).rejects.toMatchObject({status:422});
    await expect(service.create(a,{...input,allDay:false,start:'9999-01-01T00:00:00Z',end:'9999-01-01T01:00:00Z'})).rejects.toMatchObject({status:422});
  });
  it('waits for the maintenance lock before committing calendar data and events',async()=>{
    const locker=await database.pool.connect();
    await locker.query('SELECT pg_advisory_lock($1)',[WRITE_TRANSACTION_LOCK_KEY]);
    let pending:Promise<unknown>|undefined;
    let finished=false;
    try {
      pending=service.create(a,{...input,title:'等待备份'}).then(row=>{finished=true;return row;});
      await new Promise(resolve=>setTimeout(resolve,75));
      expect(finished).toBe(false);
      const waiting=await database.pool.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND objid=$1 AND NOT granted",[WRITE_TRANSACTION_LOCK_KEY]);
      expect(waiting.rows[0].n).toBeGreaterThan(0);
    } finally {
      await locker.query('SELECT pg_advisory_unlock($1)',[WRITE_TRANSACTION_LOCK_KEY]);locker.release();
      await pending;
    }
    expect(finished).toBe(true);
  });
  it('applies real handler authentication, CSRF, field errors and scoped conflict responses',async()=>{
    const origin=loadConfig().appOrigin;
    const req=(method:string,body?:unknown,cookie=cookieA,from=origin)=>new Request(`${origin}/api/calendar`,{method,headers:{cookie,Origin:from,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    expect((await routes.collection.GET(req('GET',undefined,''))).status).toBe(401);
    expect((await routes.collection.POST(req('POST',input,cookieA,'https://other.test'))).status).toBe(403);
    const invalid=await routes.collection.POST(req('POST',{...input,end:'2026-09-01'}));
    expect(invalid.status).toBe(422);expect((await invalid.json()).error.fields.end).toBeTruthy();
    const response=await routes.collection.POST(req('POST',input));expect(response.status).toBe(201);
    const row=await response.json(),params={params:Promise.resolve({id:row.id})};
    expect((await routes.item.GET(req('GET',undefined,cookieB),params)).status).toBe(404);
    expect((await routes.item.PATCH(req('PATCH',{title:'updated',version:1}),params)).status).toBe(200);
    const conflict=await routes.item.PATCH(req('PATCH',{title:'stale',version:1}),params);
    expect(conflict.status).toBe(409);expect((await conflict.json()).error.current).toMatchObject({title:'updated',version:2});
    expect((await routes.item.DELETE(req('DELETE',{version:2}),params)).status).toBe(200);
  });
});
