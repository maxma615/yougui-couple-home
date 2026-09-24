import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../../src/cli/migrate";
import { login } from "../../src/modules/auth/service";
import { withTestDatabase } from "../helpers/database";

const execute = promisify(execFile);

describe("administrator CLI entry points", () => {
  it("initializes once, rejects password arguments, resets the password and revokes sessions", async () => {
    await withTestDatabase(async (database) => {
      await runMigrations(database.pool);
      const initial = "initial-cli-password-19!";
      const replacement = "replacement-cli-password-73!";
      const env = { ...process.env, DATABASE_URL: database.databaseUrl, INIT_ADMIN_PASSWORD: initial, RESET_PASSWORD: replacement };
      const invoke = (entry: string, args: string[]) => execute(process.execPath, ["--import", "tsx", `src/cli/${entry}.ts`, ...args], { env });
      const arguments_ = ["--email", "admin@example.test", "--display-name", "首位成员"];
      const result = await invoke("init-admin", arguments_);
      expect(result.stdout).toContain("已创建首位账号");
      expect(result.stdout + result.stderr).not.toContain(initial);
      await expect(invoke("init-admin", arguments_)).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("已经完成") });
      await expect(invoke("reset-password", ["--email", "admin@example.test", "--password=unsafe"])).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining("密码不能通过命令行") });
      await login({ email: "admin@example.test", password: initial }, database.pool);
      expect((await database.pool.query("SELECT count(*)::int AS count FROM sessions")).rows[0].count).toBe(1);
      const reset = await invoke("reset-password", ["--email", "admin@example.test"]);
      expect(reset.stdout).toContain("已重置账号密码");
      expect(reset.stdout + reset.stderr).not.toContain(replacement);
      expect((await database.pool.query("SELECT count(*)::int AS count FROM sessions")).rows[0].count).toBe(0);
      await expect(login({ email: "admin@example.test", password: initial }, database.pool)).rejects.toMatchObject({ status: 401 });
      await expect(login({ email: "admin@example.test", password: replacement }, database.pool)).resolves.toHaveProperty("token");
      expect((await database.pool.query("SELECT count(*)::int AS count FROM users")).rows[0].count).toBe(1);
    });
  });
});
