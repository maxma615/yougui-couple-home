import { rm } from "node:fs/promises";
import type { Pool } from "pg";

import { loadConfig } from "@/lib/config";
import { pool, transaction } from "@/lib/db";
import { safeStoragePath } from "@/modules/photos/store";

type CleanupRow = { storage_name: string };

export async function runPhotoCleanup(
  target: Pool = pool,
  attachmentsDirectory = loadConfig().attachmentsDir,
  limit = 100,
): Promise<number> {
  let cleaned = 0;
  while (cleaned < limit) {
    const result = await transaction(async (tx) => {
      const selected = await tx.query<CleanupRow>(
        `SELECT storage_name FROM photo_cleanup_queue
         ORDER BY enqueued_at,storage_name LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const row = selected.rows[0];
      if (!row) return "empty" as const;
      try {
        await rm(safeStoragePath(attachmentsDirectory, row.storage_name));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
          await tx.query(
            `UPDATE photo_cleanup_queue
             SET attempts=attempts+1,last_error=$2 WHERE storage_name=$1`,
            [row.storage_name, error instanceof Error ? error.message.slice(0, 1000) : "文件删除失败"],
          );
          return "failed" as const;
        }
      }
      await tx.query("DELETE FROM photo_cleanup_queue WHERE storage_name=$1", [row.storage_name]);
      return "cleaned" as const;
    }, target);
    if (result !== "cleaned") break;
    cleaned += 1;
  }
  return cleaned;
}

