import { constants } from "node:fs";
import { chmod, copyFile, lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

import { runMigrations } from "@/cli/migrate";
import { verifyStorage } from "@/cli/verify-storage";
import { withMaintenanceLock } from "@/modules/backup/backup";
import { verifyBackupDirectory } from "@/modules/backup/manifest";
import { postgresEnvironment, resolvePgTool, runProcess } from "@/modules/backup/process";
import { assertNonOverlappingPaths } from "@/modules/backup/paths";

export type RestoreOptions = {
  backupDir: string;
  databaseUrl: string;
  attachmentsDir: string;
  pgRestorePath?: string;
  migrationsDir?: string;
};

async function requireEmptyAttachments(value: string): Promise<string> {
  const resolved = path.resolve(value);
  await mkdir(resolved, { recursive: true, mode: 0o750 });
  const details = await lstat(resolved);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error("Restore requires an empty attachment directory");
  }
  if ((await readdir(resolved)).length !== 0) {
    throw new Error("Restore requires an empty attachment directory");
  }
  return resolved;
}

async function requireEmptyDatabase(target: Pool): Promise<void> {
  const result = await target.query<{ name: string }>(
    `SELECT schemaname || '.' || tablename AS name
     FROM pg_catalog.pg_tables
     WHERE schemaname NOT IN ('pg_catalog','information_schema')
     ORDER BY 1 LIMIT 1`,
  );
  if (result.rowCount) throw new Error("Restore requires an empty database");
}

async function verifyRelationalIntegrity(target: Pool): Promise<void> {
  const tooMany = await target.query(
    "SELECT home_id FROM home_members GROUP BY home_id HAVING count(*) > 2 LIMIT 1",
  );
  if (tooMany.rowCount) throw new Error("Restored home has more than two members");
  const invalid = await target.query<{ invalid: number }>(`SELECT (
    (SELECT count(*) FROM home_members hm LEFT JOIN homes h ON h.id=hm.home_id LEFT JOIN users u ON u.id=hm.user_id WHERE h.id IS NULL OR u.id IS NULL) +
    (SELECT count(*) FROM invitations i LEFT JOIN homes h ON h.id=i.home_id LEFT JOIN users u ON u.id=i.inviter_id WHERE h.id IS NULL OR u.id IS NULL) +
    (SELECT count(*) FROM moments m LEFT JOIN homes h ON h.id=m.home_id WHERE h.id IS NULL) +
    (SELECT count(*) FROM photos p LEFT JOIN moments m ON m.id=p.moment_id AND m.home_id=p.home_id WHERE m.id IS NULL)
  )::int AS invalid`);
  if (invalid.rows[0].invalid !== 0) throw new Error("Restored database has broken references");
}

export async function restoreBackup(options: RestoreOptions): Promise<void> {
  if (!options.databaseUrl) throw new Error("DATABASE_URL is required");
  const backupDir = path.resolve(options.backupDir);
  const manifest = await verifyBackupDirectory(backupDir);
  await assertNonOverlappingPaths(backupDir, options.attachmentsDir);
  const attachmentsDir = await requireEmptyAttachments(options.attachmentsDir);
  const target = new Pool({ connectionString: options.databaseUrl, max: 2 });
  const inProgress = path.join(attachmentsDir, ".restore-in-progress");
  let markerCreated = false;
  try {
    await withMaintenanceLock(target, async (maintenanceClient) => {
      await requireEmptyDatabase(target);
      await writeFile(
        inProgress,
        `${JSON.stringify({ state: "in-progress", backupId: manifest.backupId, startedAt: new Date().toISOString() })}\n`,
        { flag: "wx", mode: 0o600 },
      );
      markerCreated = true;
      const archive = manifest.files.find((entry) => entry.kind === "database");
      if (!archive) throw new Error("Backup database archive is missing");
      const pgRestore = await resolvePgTool(
        "pg_restore",
        options.pgRestorePath ?? process.env.PG_RESTORE_BIN,
      );
      const pgEnvironment = postgresEnvironment(options.databaseUrl);
      await runProcess(
        pgRestore,
        [
          `--dbname=${pgEnvironment.PGDATABASE}`,
          "--single-transaction",
          "--exit-on-error",
          "--no-owner",
          "--no-privileges",
          path.join(backupDir, archive.path),
        ],
        pgEnvironment,
      );
      await runMigrations(target, options.migrationsDir);
      const photosDir = path.join(attachmentsDir, "photos");
      await mkdir(photosDir, { mode: 0o750 });
      for (const entry of manifest.files) {
        if (entry.kind === "database") continue;
        const source = path.join(backupDir, ...entry.path.split("/"));
        const destination = path.join(attachmentsDir, ...entry.path.split("/"));
        await copyFile(source, destination, constants.COPYFILE_EXCL);
        await chmod(destination, 0o600);
      }
      await maintenanceClient.query("BEGIN");
      try {
        await maintenanceClient.query("DELETE FROM sessions");
        await maintenanceClient.query(
          "UPDATE invitations SET expires_at=LEAST(expires_at,now()) WHERE consumed_at IS NULL",
        );
        await maintenanceClient.query("COMMIT");
      } catch (error) {
        await maintenanceClient.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
      await verifyRelationalIntegrity(target);
      const storage = await verifyStorage(target, attachmentsDir);
      if (
        storage.unknownOrphans.length ||
        storage.brokenReferences.length ||
        storage.hashMismatches.length
      ) {
        throw new Error("Restored attachment verification failed");
      }
      await rm(inProgress);
      markerCreated = false;
    });
  } catch (error) {
    if (markerCreated) {
      await writeFile(
        inProgress,
        `${JSON.stringify({ state: "failed", backupId: manifest.backupId, failedAt: new Date().toISOString() })}\n`,
        { flag: "w", mode: 0o600 },
      ).catch(() => undefined);
    }
    throw error;
  } finally {
    await target.end();
  }
}
