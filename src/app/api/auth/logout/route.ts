import { loadConfig } from "@/lib/config";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import {
  clearSessionCookieHeader,
  revokeSessionToken,
  tokenFromRequest,
} from "@/modules/auth/session";

export async function POST(request: Request): Promise<Response> {
  return apiRoute(async () => {
    assertJsonMutation(request, loadConfig().appOrigin);
    await readJson(request);
    await revokeSessionToken(tokenFromRequest(request));
    return json(
      { ok: true },
      { headers: { "set-cookie": clearSessionCookieHeader() } },
    );
  });
}
