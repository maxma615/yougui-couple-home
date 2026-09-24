import { requireHomeMember } from "@/lib/auth-context";
import { loadConfig } from "@/lib/config";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security";
import { issueInvitation } from "@/modules/auth/invitation";

export async function POST(request: Request): Promise<Response> {
  return apiRoute(async () => {
    assertJsonMutation(request, loadConfig().appOrigin);
    await readJson(request);
    const context = await requireHomeMember(request);
    enforceRateLimit("invite", context.userId, request);
    const invitation = await issueInvitation(context);
    return json({ token: invitation.token, expiresAt: invitation.expiresAt.toISOString() }, { status: 201 });
  });
}
