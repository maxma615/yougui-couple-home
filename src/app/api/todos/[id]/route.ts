import {todos} from '@/modules/todos/service';
import {itemRoutes} from '@/lib/resource-routes';
export const dynamic='force-dynamic';
const routes=itemRoutes(todos);
export const GET=routes.GET;
export const PATCH=routes.PATCH;
export const DELETE=routes.DELETE;
