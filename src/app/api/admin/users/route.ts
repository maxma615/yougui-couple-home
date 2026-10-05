import { requireAdmin } from "@/lib/auth-context";
import { loadConfig } from "@/lib/config";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security";
import { createManagedMember } from "@/modules/admin/service";

export async function POST(request: Request): Promise<Response> {
  return apiRoute(async () => {
    assertJsonMutation(request, loadConfig().appOrigin);
    const context = await requireAdmin(request);
    enforceRateLimit("admin", context.userId, request);
    const input = (await readJson(request)) as {
      phone?: unknown;
      displayName?: unknown;
      password?: unknown;
      homeId?: unknown;
      slot?: unknown;
    };
    return json(
      await createManagedMember(context, {
        phone: input.phone,
        displayName: input.displayName,
        password: input.password,
        homeId: input.homeId,
        slot: input.slot,
      }),
      { status: 201 },
    );
  });
}
