import { option, readSecret, rejectPasswordArguments } from "@/cli/secret-input";
import { pool } from "@/lib/db";
import { resetPassword } from "@/modules/auth/service";

export async function main(): Promise<void> {
  rejectPasswordArguments();
  const email = option("email");
  if (!email) throw new Error("用法：reset-password --email <邮箱>");
  const password = process.env.RESET_PASSWORD ?? (await readSecret("新密码："));
  const user = await resetPassword(email, password);
  console.info(`已重置账号密码：${user.email}`);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "密码重置失败");
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
