import { requireAdmin } from "@/lib/auth-context";
import { loadConfig } from "@/lib/config";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security";
import { patchManagedMember, type PatchManagedMemberInput } from "@/modules/admin/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(async () => {
    assertJsonMutation(request, loadConfig().appOrigin);
    const admin = await requireAdmin(request);
    enforceRateLimit("admin", admin.userId, request);
    const input = (await readJson(request)) as PatchManagedMemberInput;
    const { id } = await context.params;
    return json(await patchManagedMember(admin, id, input));
  });
}
