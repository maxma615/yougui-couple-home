import { loadConfig } from "@/lib/config";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import { auditSecurityEvent, enforceRateLimit } from "@/lib/security";
import { login } from "@/modules/auth/service";
import { sessionCookieHeader, tokenFromRequest } from "@/modules/auth/session";

export async function POST(request: Request): Promise<Response> {
  return apiRoute(async () => {
    assertJsonMutation(request, loadConfig().appOrigin);
    const input = (await readJson(request)) as { email?: unknown; password?: unknown };
    const account = typeof input.email === "string" ? input.email : "invalid-account";
    enforceRateLimit("login", account, request);
    const result = await login({ email: input.email, password: input.password, previousToken:tokenFromRequest(request) });
    auditSecurityEvent("login_route", "success", { actorId: result.user.id });
    return json(
      { ok: true },
      { headers: { "set-cookie": sessionCookieHeader(result.token, result.expiresAt) } },
    );
  });
}
