import { pool } from "@/lib/db";
import { initializeAdmin } from "@/modules/auth/service";
import { option, readSecret, rejectPasswordArguments } from "@/cli/secret-input";

export async function main(): Promise<void> {
  rejectPasswordArguments();
  const email = option("email");
  const displayName = option("display-name");
  if (!email || !displayName) {
    throw new Error("用法：init-admin --email <邮箱> --display-name <显示名称>");
  }
  const password = process.env.INIT_ADMIN_PASSWORD ?? (await readSecret("初始密码："));
  const user = await initializeAdmin({ email, displayName, password });
  console.info(`已创建首位账号：${user.email}`);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  main()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "初始化失败");
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
