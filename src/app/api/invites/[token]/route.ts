import { loadConfig } from "@/lib/config";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security";
import { acceptInvitation, getInvitationPreview } from "@/modules/auth/invitation";
import { sessionCookieHeader } from "@/modules/auth/session";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(async () => {
    const { token } = await context.params;
    return json(await getInvitationPreview(token));
  });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  return apiRoute(async () => {
    assertJsonMutation(request, loadConfig().appOrigin);
    const input = (await readJson(request)) as {
      email?: unknown;
      displayName?: unknown;
      password?: unknown;
    };
    enforceRateLimit(
      "invite",
      typeof input.email === "string" ? input.email : "invalid-account",
      request,
    );
    const { token } = await context.params;
    const accepted = await acceptInvitation(token, {
      email: input.email,
      displayName: input.displayName,
      password: input.password,
    });
    return json(
      { ok: true },
      { headers: { "set-cookie": sessionCookieHeader(accepted.token, accepted.expiresAt) } },
    );
  });
}
