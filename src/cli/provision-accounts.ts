import { pathToFileURL } from "node:url";
import path from "node:path";
import { pool } from "@/lib/db";
import { provisionCoupleAccounts } from "@/modules/admin/provision";

export async function main(): Promise<void> {
  if (process.argv.slice(2).length || process.stdin.isTTY) throw new Error("账号配置仅通过受保护的标准输入 JSON 提供，不接受命令行凭据");
  let input = "";
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (Buffer.byteLength(input) > 16_384) throw new Error("账号配置过大");
  }
  let config: unknown;
  try { config = JSON.parse(input); } catch { throw new Error("账号配置 JSON 无效"); }
  await provisionCoupleAccounts(config);
  console.info("已配置独立管理员和同一空间的两位成员；未输出密码或手机号。");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    // Database errors can include a unique constraint's value. Never echo them.
    console.error(error instanceof Error && error.name === "AppError" ? error.message : "账号配置失败，请检查输入和账号冲突");
    process.exitCode = 1;
  }).finally(() => pool.end());
}
