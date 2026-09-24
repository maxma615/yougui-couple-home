import { itemRoutes } from "@/lib/resource-routes";
import { moments } from "@/modules/moments/service";

export const dynamic = "force-dynamic";
const routes = itemRoutes(moments);
export const GET = routes.GET;
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;

