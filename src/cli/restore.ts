import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadConfig } from "@/lib/config";
import { restoreBackup } from "@/modules/backup/restore";

export async function restoreMain(args = process.argv.slice(2)): Promise<void> {
  if (args.length !== 1 || !args[0]) {
    throw new Error("Usage: restore <completed-backup-directory>");
  }
  const config = loadConfig();
  await restoreBackup({
    backupDir: args[0],
    databaseUrl: config.databaseUrl,
    attachmentsDir: config.attachmentsDir,
  });
  console.log(JSON.stringify({ ok: true, backup: path.basename(path.resolve(args[0])) }));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  restoreMain().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Restore failed");
    process.exitCode = 1;
  });
}
