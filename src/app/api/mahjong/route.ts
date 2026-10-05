import { loadConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { apiRoute, assertJsonMutation, json, readJson } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security";
import { requireMahjongPlayer } from "@/modules/mahjong/auth";
import { mahjongRunning, proxyMahjong, wakeMahjong } from "@/modules/mahjong/process";
import { parseMahjongCommand } from "@/modules/mahjong/rooms";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return apiRoute(async () => {
    await requireMahjongPlayer(request);
    if (!(await mahjongRunning())) return json({ room: null, serviceRunning: false });
    return proxyMahjong(request);
  });
}
export async function POST(request: Request) {
  return apiRoute(async () => {
    assertJsonMutation(request, loadConfig().appOrigin);
    const player = await requireMahjongPlayer(request);
    const command = parseMahjongCommand(await readJson(request));
    enforceRateLimit("mahjong", player.userId, request, { limit: 180, windowMs: 60_000 });
    const running = await mahjongRunning();
    if (!running) {
      if (command.action !== "create" && command.action !== "join") throw new AppError(409, "game_released", "牌桌已释放或服务重启，请重新创建牌桌");
      await wakeMahjong();
    }
    return proxyMahjong(request, command);
  });
}
