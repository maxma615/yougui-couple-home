import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import type { AuthContext } from '../../lib/auth-context';
import { pool, transaction } from '../../lib/db';
import { AppError } from '../../lib/errors';
import { publishHomeEvent } from '../../lib/events/publisher';
import { parseLocalDate } from '../../lib/local-date';
import { requireResourceId, requireVersion } from '../../lib/resource-service';
import { title, longText, parseFields } from '../../lib/validation';
import type { CalendarEventDto, CalendarValues } from './schema';
import { parseOffsetInstant, shanghaiDateTimeInput, MIN_CALENDAR_DATE, MAX_CALENDAR_DATE } from './time';

const inputSchema=z.object({title,location:z.string().max(500,'地点不能超过500字').default(''),description:longText,allDay:z.boolean(),start:z.string(),end:z.string()});

function values(input:unknown):CalendarValues {
  const value=parseFields(inputSchema,input);
  const fields:Record<string,string>={};
  for(const field of ['start','end'] as const) {
    try {
      value[field]=value.allDay?parseLocalDate(value[field]):parseOffsetInstant(value[field]);
      const date=value.allDay?value[field]:shanghaiDateTimeInput(value[field]).slice(0,10);
      if(date<MIN_CALENDAR_DATE||date>MAX_CALENDAR_DATE) throw new Error('日历日期需在0002年至9998年之间');
    }
    catch(error) { fields[field]=error instanceof Error?error.message:'日期时间无效'; }
  }
  if(!Object.keys(fields).length && (value.allDay?value.end<value.start:Date.parse(value.end)<Date.parse(value.start))) fields.end='结束不能早于开始';
  if(Object.keys(fields).length) throw new AppError(422,'VALIDATION','请检查填写的内容',fields);
  return value;
}

type StoredRow={id:string;title:string;location:string;description:string;all_day:boolean;start_date:string|null;end_date:string|null;start_at:Date|null;end_at:Date|null;version:number;created_at:Date;updated_at:Date;created_by:string;updated_by:string};
const projection='id,title,location,description,all_day,start_date::text,end_date::text,start_at,end_at,version,created_at,updated_at,created_by,updated_by';
function dto(row:StoredRow):CalendarEventDto {
  return {id:row.id,title:row.title,location:row.location,description:row.description,allDay:row.all_day,start:row.all_day?row.start_date!:row.start_at!.toISOString(),end:row.all_day?row.end_date!:row.end_at!.toISOString(),version:row.version,createdAt:row.created_at.toISOString(),updatedAt:row.updated_at.toISOString(),createdBy:row.created_by,updatedBy:row.updated_by};
}
function columns(value:CalendarValues):unknown[] {
  return [value.title,value.location,value.description,value.allDay,value.allDay?value.start:null,value.allDay?value.end:null,value.allDay?null:value.start,value.allDay?null:value.end];
}
function checkVersion(current:CalendarEventDto,version:number) {
  if(current.version!==version) throw new AppError(409,'VERSION_CONFLICT','另一位成员已经修改了这条日历事项，请比较后再保存',undefined,current);
}

export function createCalendarService(target:Pool=pool) {
  async function get(ctx:AuthContext,id:string,connection:Pool|PoolClient=target,lock=false):Promise<CalendarEventDto> {
    requireResourceId(id);
    const result=await connection.query<StoredRow>(`SELECT ${projection} FROM calendar_events WHERE home_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[ctx.homeId,id]);
    if(!result.rows[0]) throw new AppError(404,'NOT_FOUND','日历事项不存在');
    return dto(result.rows[0]);
  }
  return {
    get,
    async list(ctx:AuthContext):Promise<CalendarEventDto[]> {
      const result=await target.query<StoredRow>(`SELECT ${projection} FROM calendar_events WHERE home_id=$1 ORDER BY COALESCE(start_date,(start_at AT TIME ZONE 'Asia/Shanghai')::date),all_day DESC,start_at,id`,[ctx.homeId]);
      return result.rows.map(dto);
    },
    async create(ctx:AuthContext,input:unknown):Promise<CalendarEventDto> {
      const value=values(input);
      return transaction(async tx=>{
        const result=await tx.query<StoredRow>(`INSERT INTO calendar_events(home_id,created_by,updated_by,title,location,description,all_day,start_date,end_date,start_at,end_at)
          VALUES($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${projection}`,[ctx.homeId,ctx.userId,...columns(value)]);
        const row=dto(result.rows[0]);
        await publishHomeEvent(tx,{homeId:ctx.homeId,type:'calendar',resourceId:row.id,action:'created',version:row.version});
        return row;
      },target);
    },
    async update(ctx:AuthContext,id:string,input:unknown):Promise<CalendarEventDto> {
      const patch=(input&&typeof input==='object'&&!Array.isArray(input)?input:{}) as Record<string,unknown>;
      const version=requireVersion(patch.version);
      return transaction(async tx=>{
        const current=await get(ctx,id,tx,true);checkVersion(current,version);
        const value=values({...current,...patch});
        if((Object.keys(value) as (keyof CalendarValues)[]).every(key=>value[key]===current[key])) return current;
        const result=await tx.query<StoredRow>(`UPDATE calendar_events SET title=$4,location=$5,description=$6,all_day=$7,start_date=$8,end_date=$9,start_at=$10,end_at=$11,
          version=version+1,updated_at=now(),updated_by=$3 WHERE home_id=$1 AND id=$2 RETURNING ${projection}`,[ctx.homeId,id,ctx.userId,...columns(value)]);
        const row=dto(result.rows[0]);
        await publishHomeEvent(tx,{homeId:ctx.homeId,type:'calendar',resourceId:id,action:'updated',version:row.version});
        return row;
      },target);
    },
    async remove(ctx:AuthContext,id:string,version:unknown):Promise<void> {
      const expected=requireVersion(version);
      await transaction(async tx=>{
        const current=await get(ctx,id,tx,true);checkVersion(current,expected);
        await tx.query('DELETE FROM calendar_events WHERE home_id=$1 AND id=$2',[ctx.homeId,id]);
        await publishHomeEvent(tx,{homeId:ctx.homeId,type:'calendar',resourceId:id,action:'deleted',version:current.version+1});
      },target);
    },
  };
}

export const calendar=createCalendarService();
