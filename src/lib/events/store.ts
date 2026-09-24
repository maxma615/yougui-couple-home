import type { Pool } from 'pg';
import { pool } from '../db';
import type { HomeEventInput } from './publisher';

export type HomeEvent = Omit<HomeEventInput,'homeId'> & {id:string};
export type EventBatch = {reset:boolean;cursor:string;events:HomeEvent[]};

export async function readHomeEvents(homeId:string, cursor:string|null=null, target:Pool=pool):Promise<EventBatch> {
  const client=await target.connect();
  try {
    // Retention and event selection must share one snapshot.
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const {rows:[bounds]}=await client.query<{first:string|null;last:string|null}>(
      'SELECT min(id)::text AS first,max(id)::text AS last FROM home_events WHERE home_id=$1',[homeId],
    );
    const newest=bounds.last ?? '0';
    const invalid=cursor===null || !/^\d{1,19}$/.test(cursor);
    const outside=!invalid && (BigInt(cursor)>BigInt(newest) || (bounds.first!==null && BigInt(cursor)<BigInt(bounds.first)));
    if(invalid || outside){
      await client.query('COMMIT');
      return {reset:true,cursor:newest,events:[]};
    }
    const {rows}=await client.query<HomeEvent>(`SELECT id::text,resource_type AS type,resource_id AS "resourceId",action,version
      FROM home_events WHERE home_id=$1 AND id>$2 ORDER BY id LIMIT 200`,[homeId,cursor]);
    await client.query('COMMIT');
    return {reset:false,cursor:rows.at(-1)?.id??cursor!,events:rows};
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
