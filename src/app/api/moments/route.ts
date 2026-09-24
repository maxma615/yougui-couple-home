import { collectionRoutes } from "@/lib/resource-routes";
import { moments } from "@/modules/moments/service";

export const dynamic = "force-dynamic";
const routes = collectionRoutes(moments);
export const GET = routes.GET;
export const POST = routes.POST;

