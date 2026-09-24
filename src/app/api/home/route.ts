import { requireHomeMember, requireSession } from "@/lib/auth-context";
import { loadConfig } from "@/lib/config";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import { createHome, getHome, updateHome } from "@/modules/home/service";

export async function GET(request: Request): Promise<Response> {
  return apiRoute(async () => json(await getHome(await requireHomeMember(request))));
}

export async function POST(request: Request): Promise<Response> {
  return apiRoute(async () => {
    assertJsonMutation(request, loadConfig().appOrigin);
    const { userId } = await requireSession(request);
    const input = (await readJson(request)) as {
      name?: unknown;
      startDate?: unknown;
      displayName?: unknown;
    };
    return json(
      await createHome(userId, {
        name: input.name,
        startDate: input.startDate,
        displayName: input.displayName,
      }),
      { status: 201 },
    );
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return apiRoute(async () => {
    assertJsonMutation(request, loadConfig().appOrigin);
    const context = await requireHomeMember(request);
    const input = (await readJson(request)) as {
      name?: unknown;
      startDate?: unknown;
      members?: unknown;
      version?: unknown;
    };
    return json(
      await updateHome(context, {
        name: input.name,
        startDate: input.startDate,
        members: input.members,
        version: input.version,
      }),
    );
  });
}
