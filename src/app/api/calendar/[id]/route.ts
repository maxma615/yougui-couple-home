import { createCalendarRoutes } from '../handlers';
export const dynamic='force-dynamic';
const routes=createCalendarRoutes().item;
export const GET=routes.GET;
export const PATCH=routes.PATCH;
export const DELETE=routes.DELETE;
