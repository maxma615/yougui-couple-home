import {requireHomeMember} from './auth-context';
import {loadConfig} from './config';
import {apiRoute,assertJsonMutation,readJson,json} from './http';
import type {createResourceService} from './resource-service';

type Service=ReturnType<typeof createResourceService>;
type RouteContext={params:Promise<{id:string}>};
export function collectionRoutes(service:Pick<Service,'list'|'create'>){
  return {
    GET:(request:Request)=>apiRoute(async()=>json({items:await service.list(await requireHomeMember(request))})),
    POST:(request:Request)=>apiRoute(async()=>{
      assertJsonMutation(request,loadConfig().appOrigin);
      const ctx=await requireHomeMember(request);
      return json(await service.create(ctx,await readJson(request)),{status:201});
    }),
  };
}
export function itemRoutes(service:Pick<Service,'get'|'update'|'remove'>){
  return {
    GET:(request:Request,route:RouteContext)=>apiRoute(async()=>json(await service.get(await requireHomeMember(request),(await route.params).id))),
    PATCH:(request:Request,route:RouteContext)=>apiRoute(async()=>{
      assertJsonMutation(request,loadConfig().appOrigin);
      const ctx=await requireHomeMember(request);
      return json(await service.update(ctx,(await route.params).id,await readJson(request)));
    }),
    DELETE:(request:Request,route:RouteContext)=>apiRoute(async()=>{
      assertJsonMutation(request,loadConfig().appOrigin);
      const ctx=await requireHomeMember(request);
      const body=await readJson(request) as {version?:unknown};
      await service.remove(ctx,(await route.params).id,body?.version);
      return json({ok:true});
    }),
  };
}
