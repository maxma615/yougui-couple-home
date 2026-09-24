import type { PoolClient } from 'pg';

export type HomeEventInput = {
  homeId: string;
  type: 'home' | 'anniversary' | 'todo' | 'moment' | 'calendar';
  resourceId: string;
  action: 'created' | 'updated' | 'deleted';
  version: number;
};

/** Call inside the same transaction as the business write, before COMMIT. */
export async function publishHomeEvent(tx: PoolClient, event: HomeEventInput): Promise<string> {
  // Sequence values alone are NOT commit-ordered: a concurrent transaction can
  // obtain a larger ID and commit first. Serialize each home's publishers until
  // COMMIT so Last-Event-ID never skips a late commit with a smaller ID.
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 7812))', [event.homeId]);
  const { rows } = await tx.query<{id:string}>(
    `INSERT INTO home_events(home_id,resource_type,resource_id,action,version)
     VALUES ($1,$2,$3,$4,$5) RETURNING id::text`,
    [event.homeId,event.type,event.resourceId,event.action,event.version],
  );
  await tx.query(`DELETE FROM home_events WHERE home_id=$1 AND id < (
    SELECT id FROM home_events WHERE home_id=$1 ORDER BY id DESC OFFSET 999 LIMIT 1
  )`, [event.homeId]);
  return rows[0].id;
}
