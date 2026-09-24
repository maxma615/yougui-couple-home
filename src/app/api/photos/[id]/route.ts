import { createPhotoItemRoutes } from "@/modules/photos/routes";

export const dynamic = "force-dynamic";
const routes = createPhotoItemRoutes();
export const GET = routes.GET;
export const DELETE = routes.DELETE;
