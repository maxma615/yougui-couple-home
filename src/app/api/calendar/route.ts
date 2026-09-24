import { createCalendarRoutes } from './handlers';
export const dynamic='force-dynamic';
const routes=createCalendarRoutes().collection;
export const GET=routes.GET;
export const POST=routes.POST;
