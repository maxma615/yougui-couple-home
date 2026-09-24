import {anniversaries} from '@/modules/anniversaries/service';
import {collectionRoutes} from '@/lib/resource-routes';
export const dynamic='force-dynamic';
const routes=collectionRoutes(anniversaries);
export const GET=routes.GET;
export const POST=routes.POST;
