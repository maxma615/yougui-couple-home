import { mahjongPort } from "@/modules/mahjong/process";
import { runMahjongServer } from "@/modules/mahjong/server";

runMahjongServer({ port: mahjongPort() }).then(service => {
  process.once("SIGTERM", () => { void service.close(); });
  process.once("SIGINT", () => { void service.close(); });
}).catch(() => { console.error("Mahjong service could not start"); process.exitCode = 1; });
