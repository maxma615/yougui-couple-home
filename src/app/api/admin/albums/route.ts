import { createAdminAlbumRoutes } from "@/modules/admin/albums";

export const runtime = "nodejs";
export const GET = createAdminAlbumRoutes().list;
