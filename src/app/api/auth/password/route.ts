import { requireSession } from "@/lib/auth-context";
import { loadConfig } from "@/lib/config";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security";
import { changePassword } from "@/modules/auth/service";
import { sessionCookieHeader } from "@/modules/auth/session";

export async function POST(request: Request): Promise<Response> {
  return apiRoute(async () => {
    assertJsonMutation(request, loadConfig().appOrigin);
    const context = await requireSession(request);
    enforceRateLimit("password", context.userId, request);
    const input = (await readJson(request)) as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };
    const session = await changePassword(context.userId, {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });
    return json(
      { ok: true },
      { headers: { "set-cookie": sessionCookieHeader(session.token, session.expiresAt) } },
    );
  });
}
