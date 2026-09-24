import path from "node:path";
import { pathToFileURL } from "node:url";

import { pool } from "@/lib/db";
import { runPhotoCleanup } from "@/modules/photos/cleanup";

async function main(): Promise<void> {
  try {
    const cleaned = await runPhotoCleanup();
    console.log(JSON.stringify({ cleaned }));
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Photo cleanup failed");
    process.exitCode = 1;
  });
}

