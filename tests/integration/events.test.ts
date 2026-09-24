import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from '../helpers/database';
import { runMigrations } from '../../src/cli/migrate';
import { publishHomeEvent } from '../../src/lib/events/publisher';
import { readHomeEvents } from '../../src/lib/events/store';

// These tests catch cross-home reads, lost events at transaction boundaries and
// stale cursors that would leave a reconnecting browser permanently out of date.
describe('durable home events', () => {
  let database: TestDatabase;
  const homeA = randomUUID(), homeB = randomUUID();
  beforeAll(async () => {
    database = await createTestDatabase();
    await runMigrations(database.pool);
    await database.pool.query('INSERT INTO homes (id,name,start_date) VALUES ($1,$2,$3),($4,$5,$3)', [homeA,'A','2020-01-01',homeB,'B']);
  });
  afterAll(async () => { await database?.cleanup(); });

  it('commits only metadata and never returns another home’s events', async () => {
    const tx = await database.pool.connect();
    try {
      await tx.query('BEGIN');
      await publishHomeEvent(tx,{homeId:homeA,type:'todo',resourceId:randomUUID(),action:'created',version:1});
      await tx.query('COMMIT');
      const initial = await readHomeEvents(homeA,null,database.pool);
      expect(initial.reset).toBe(true);
      const resourceId=randomUUID();
      await tx.query('BEGIN');
      const id=await publishHomeEvent(tx,{homeId:homeA,type:'todo',resourceId,action:'updated',version:2});
      await tx.query('COMMIT');
      const result=await readHomeEvents(homeA,initial.cursor,database.pool);
      expect(result.reset).toBe(false);
      expect(result.events).toEqual([{id,type:'todo',resourceId,action:'updated',version:2}]);
      expect((await readHomeEvents(homeB,'0',database.pool)).events).toEqual([]);
      expect((await readHomeEvents(homeA,id,database.pool)).events).toEqual([]);
    } finally { tx.release(); }
  });

  it('rolls back notifications when a business transaction fails', async () => {
    const before = await readHomeEvents(homeA,null,database.pool);
    const tx=await database.pool.connect();
    try {
      await tx.query('BEGIN');
      await publishHomeEvent(tx,{homeId:homeA,type:'moment',resourceId:randomUUID(),action:'deleted',version:3});
      await tx.query('ROLLBACK');
    } finally { tx.release(); }
    expect((await readHomeEvents(homeA,before.cursor,database.pool)).events).toEqual([]);
  });

  it('keeps event IDs in commit order so reconnect cursors cannot skip late commits', async () => {
    const before = await readHomeEvents(homeA,null,database.pool);
    const first = await database.pool.connect(), second = await database.pool.connect();
    let secondWrite: Promise<string> | undefined;
    try {
      await first.query('BEGIN');
      await second.query('BEGIN');
      const firstId = await publishHomeEvent(first,{homeId:homeA,type:'todo',resourceId:randomUUID(),action:'created',version:1});
      const pid = (await second.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      secondWrite = publishHomeEvent(second,{homeId:homeA,type:'moment',resourceId:randomUUID(),action:'created',version:1});
      let waitEvent: string | null = null;
      for(let attempt=0;attempt<100;attempt++) {
        waitEvent = (await database.pool.query<{wait_event:string|null}>('SELECT wait_event FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event ?? null;
        if(waitEvent === 'advisory') break;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      expect(waitEvent).toBe('advisory');
      expect((await readHomeEvents(homeA,before.cursor,database.pool)).events).toEqual([]);
      await first.query('COMMIT');
      const secondId = await secondWrite;
      await second.query('COMMIT');
      expect(BigInt(secondId)).toBeGreaterThan(BigInt(firstId));
      const resumed = await readHomeEvents(homeA,firstId,database.pool);
      expect(resumed.events.map(event=>event.id)).toEqual([secondId]);
    } finally {
      await first.query('ROLLBACK');
      await secondWrite?.catch(()=>undefined);
      await second.query('ROLLBACK');
      first.release();second.release();
    }
  });

  it('asks for full refresh when retention prunes a disconnected cursor', async () => {
    const before=await readHomeEvents(homeA,null,database.pool);
    await database.pool.query('DELETE FROM home_events WHERE home_id=$1',[homeA]);
    const tx=await database.pool.connect();
    try {
      await tx.query('BEGIN');
      await publishHomeEvent(tx,{homeId:homeA,type:'home',resourceId:homeA,action:'updated',version:3});
      await tx.query('COMMIT');
    } finally { tx.release(); }
    const result=await readHomeEvents(homeA,before.cursor,database.pool);
    expect(result.reset).toBe(true);
    expect(BigInt(result.cursor)).toBeGreaterThan(BigInt(before.cursor));
    expect(result.events).toEqual([]);
  });
});
