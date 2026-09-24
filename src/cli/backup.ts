import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadConfig } from "@/lib/config";
import { createBackup } from "@/modules/backup/backup";

export async function backupMain(args = process.argv.slice(2)): Promise<void> {
  if (args.length !== 1 || !args[0]) {
    throw new Error("Usage: backup <destination-directory>");
  }
  const config = loadConfig();
  const result = await createBackup({
    databaseUrl: config.databaseUrl,
    attachmentsDir: config.attachmentsDir,
    destinationRoot: args[0],
  });
  console.log(
    JSON.stringify({
      ok: true,
      backupId: result.backupId,
      directory: result.directory,
      files: result.manifest.files.length,
      bytes: result.manifest.totalBytes,
    }),
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  backupMain().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Backup failed");
    process.exitCode = 1;
  });
}
