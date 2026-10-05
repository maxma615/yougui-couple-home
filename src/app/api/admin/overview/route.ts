import { requireAdmin } from "@/lib/auth-context";
import { apiRoute, json } from "@/lib/http";
import { getAdminOverview } from "@/modules/admin/service";

export async function GET(request: Request): Promise<Response> {
  return apiRoute(async () => json(await getAdminOverview(await requireAdmin(request))));
}
