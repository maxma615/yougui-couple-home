import type {Pool,PoolClient} from 'pg';
import {pool,transaction} from './db';
import {AppError} from './errors';
import {publishHomeEvent,type HomeEventInput} from './events/publisher';

export type ResourceContext={homeId:string;userId:string};
export type ResourceRow={id:string;version:number;createdBy:string;updatedBy:string;[key:string]:unknown};
type Definition={
  table:'anniversaries'|'todos'|'moments'|'calendar_events';
  type:HomeEventInput['type'];
  columns:Record<string,string>;
  dates?:string[];
  orderBy:string;
  parse(input:unknown):Record<string,unknown>;
  validate?(ctx:ResourceContext,data:Record<string,unknown>,tx:PoolClient):Promise<void>;
  compute?(data:Record<string,unknown>,current?:ResourceRow):Record<string,unknown>;
};

export function requireVersion(value:unknown):number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1) throw new AppError(422,'INVALID_VERSION','请刷新内容后重试',{version:'缺少有效的版本号'});
  return value;
}
export function requireResourceId(value:string) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AppError(404,'NOT_FOUND','内容不存在');
}

/** SQL identifiers below come solely from static module definitions, never input. */
export function createResourceService(def:Definition,target:Pool=pool) {
  const projection=`id,version,created_at AS "createdAt",updated_at AS "updatedAt",created_by AS "createdBy",updated_by AS "updatedBy",`+
    Object.entries(def.columns).map(([key,col])=>`${col}${def.dates?.includes(key)?'::text':''} AS "${key}"`).join(',');
  const dto=(row:ResourceRow):ResourceRow=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date?value.toISOString():value])) as ResourceRow;
  async function get(ctx:ResourceContext,id:string,connection:Pool|PoolClient=target,lock=false):Promise<ResourceRow>{
    requireResourceId(id);
    const {rows}=await connection.query<ResourceRow>(`SELECT ${projection} FROM ${def.table} WHERE home_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[ctx.homeId,id]);
    if(!rows[0])throw new AppError(404,'NOT_FOUND','内容不存在');
    return dto(rows[0]);
  }
  function conflict(current:ResourceRow,version:number){
    if(current.version!==version)throw new AppError(409,'VERSION_CONFLICT','另一位成员已经修改了这条内容，请比较后再保存',undefined,current);
  }
  return {
    get,
    async list(ctx:ResourceContext):Promise<ResourceRow[]>{
      const {rows}=await target.query<ResourceRow>(`SELECT ${projection} FROM ${def.table} WHERE home_id=$1 ORDER BY ${def.orderBy}`,[ctx.homeId]);
      return rows.map(dto);
    },
    async create(ctx:ResourceContext,input:unknown):Promise<ResourceRow>{
      return transaction(async tx=>{
        const data=def.parse(input);await def.validate?.(ctx,data,tx);
        const values={...data,...def.compute?.(data)};
        const keys=Object.keys(values);
        const {rows}=await tx.query<ResourceRow>(`INSERT INTO ${def.table}(home_id,created_by,updated_by,${keys.map(key=>def.columns[key]).join(',')})
          VALUES ($1,$2,$2,${keys.map((_,index)=>`$${index+3}`).join(',')}) RETURNING ${projection}`,[ctx.homeId,ctx.userId,...keys.map(key=>values[key])]);
        const row=dto(rows[0]);
        await publishHomeEvent(tx,{homeId:ctx.homeId,type:def.type,resourceId:row.id,action:'created',version:row.version});
        return row;
      },target);
    },
    async update(ctx:ResourceContext,id:string,input:unknown):Promise<ResourceRow>{
      const patch=(input&&typeof input==='object'&&!Array.isArray(input)?input:{}) as Record<string,unknown>;
      const version=requireVersion(patch.version);
      return transaction(async tx=>{
        const current=await get(ctx,id,tx,true);conflict(current,version);
        const data=def.parse({...current,...patch});await def.validate?.(ctx,data,tx);
        if(Object.entries(data).every(([key,value])=>current[key]===value))return current;
        const values={...data,...def.compute?.(data,current)};
        const keys=Object.keys(values);
        const {rows}=await tx.query<ResourceRow>(`UPDATE ${def.table} SET ${keys.map((key,index)=>`${def.columns[key]}=$${index+4}`).join(',')},
          version=version+1,updated_at=now(),updated_by=$3 WHERE home_id=$1 AND id=$2 RETURNING ${projection}`,[ctx.homeId,id,ctx.userId,...keys.map(key=>values[key])]);
        const row=dto(rows[0]);
        await publishHomeEvent(tx,{homeId:ctx.homeId,type:def.type,resourceId:id,action:'updated',version:row.version});
        return row;
      },target);
    },
    async remove(ctx:ResourceContext,id:string,version:unknown):Promise<void>{
      const expected=requireVersion(version);
      await transaction(async tx=>{
        const current=await get(ctx,id,tx,true);conflict(current,expected);
        await tx.query(`DELETE FROM ${def.table} WHERE home_id=$1 AND id=$2`,[ctx.homeId,id]);
        await publishHomeEvent(tx,{homeId:ctx.homeId,type:def.type,resourceId:id,action:'deleted',version:current.version+1});
      },target);
    },
  };
}
