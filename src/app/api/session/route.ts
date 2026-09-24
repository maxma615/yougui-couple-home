import { apiRoute, json } from "@/lib/http";
import { getSessionSnapshot } from "@/modules/auth/service";

export async function GET(request: Request): Promise<Response> {
  return apiRoute(async () => json(await getSessionSnapshot(request)));
}
