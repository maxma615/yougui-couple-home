import type { Pool } from 'pg';
import { pool } from '@/lib/db';
import { requireHomeMember } from '@/lib/auth-context';
import { loadConfig } from '@/lib/config';
import { apiRoute, assertJsonMutation, json, readJson } from '@/lib/http';
import { createCalendarService } from '@/modules/calendar/service';
type RouteContext={params:Promise<{id:string}>};
export function createCalendarRoutes(target:Pool=pool) {
  const service=createCalendarService(target);
  return {
    collection:{
      GET:(request:Request)=>apiRoute(async()=>json({items:await service.list(await requireHomeMember(request,target))})),
      POST:(request:Request)=>apiRoute(async()=>{
        assertJsonMutation(request,loadConfig().appOrigin);
        const ctx=await requireHomeMember(request,target);
        return json(await service.create(ctx,await readJson(request)),{status:201});
      }),
    },
    item:{
      GET:(request:Request,route:RouteContext)=>apiRoute(async()=>json(await service.get(await requireHomeMember(request,target),(await route.params).id))),
      PATCH:(request:Request,route:RouteContext)=>apiRoute(async()=>{
        assertJsonMutation(request,loadConfig().appOrigin);
        const ctx=await requireHomeMember(request,target);
        return json(await service.update(ctx,(await route.params).id,await readJson(request)));
      }),
      DELETE:(request:Request,route:RouteContext)=>apiRoute(async()=>{
        assertJsonMutation(request,loadConfig().appOrigin);
        const ctx=await requireHomeMember(request,target);
        const body=await readJson(request) as {version?:unknown};
        await service.remove(ctx,(await route.params).id,body.version);
        return json({ok:true});
      }),
    },
  };
}
