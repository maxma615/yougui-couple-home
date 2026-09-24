import {todos} from '@/modules/todos/service';
import {collectionRoutes} from '@/lib/resource-routes';
export const dynamic='force-dynamic';
const routes=collectionRoutes(todos);
export const GET=routes.GET;
export const POST=routes.POST;
