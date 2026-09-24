import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, lstat, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";

import { verifyStorage } from "@/cli/verify-storage";
import { WRITE_TRANSACTION_LOCK_KEY } from "@/lib/db";
import {
  photoBackupPath,
  encodeManifest,
  sha256File,
  writeEncodedManifest,
  type BackupFile,
  type BackupManifest,
} from "@/modules/backup/manifest";
import { postgresEnvironment, resolvePgTool, runProcess } from "@/modules/backup/process";
import { assertNonOverlappingPaths } from "@/modules/backup/paths";
import { safeStoragePath } from "@/modules/photos/store";

type PhotoReference = {
  storage_name: string;
  sha256: string;
  byte_size: string;
};

const MIGRATION_LOCK_KEY = 71_923_002;

export type BackupOptions = {
  databaseUrl: string;
  attachmentsDir: string;
  destinationRoot: string;
  pgDumpPath?: string;
  now?: Date;
};

export type BackupResult = {
  backupId: string;
  directory: string;
  manifest: BackupManifest;
};

function backupId(now: Date): string {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${timestamp}-${randomBytes(6).toString("hex")}`;
}

async function realDirectory(value: string): Promise<string> {
  const resolved = path.resolve(value);
  await mkdir(resolved, { recursive: true, mode: 0o750 });
  const details = await lstat(resolved);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error("Backup destination must be a real directory");
  }
  return resolved;
}

export async function withMaintenanceLock<T>(
  target: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await target.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [WRITE_TRANSACTION_LOCK_KEY]);
    locked = true;
    return await fn(client);
  } finally {
    if (locked) {
      await client
        .query("SELECT pg_advisory_unlock($1)", [WRITE_TRANSACTION_LOCK_KEY])
        .catch(() => undefined);
    }
    client.release();
  }
}

export async function withBackupSnapshotLocks<T>(
  target: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withMaintenanceLock(target, async (client) => {
    let migrationLocked = false;
    try {
      await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
      migrationLocked = true;
      return await fn(client);
    } finally {
      if (migrationLocked) {
        await client
          .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
          .catch(() => undefined);
      }
    }
  });
}

async function copyVerifiedPhoto(
  attachmentsDir: string,
  partialDir: string,
  reference: PhotoReference,
  kind: "active-photo" | "pending-cleanup-photo",
): Promise<BackupFile> {
  const source = safeStoragePath(attachmentsDir, reference.storage_name);
  const details = await lstat(source);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error("Photo source is not a regular file");
  const relative = photoBackupPath(reference.storage_name);
  const destination = path.join(partialDir, ...relative.split("/"));
  await copyFile(source, destination, constants.COPYFILE_EXCL);
  await chmod(destination, 0o600);
  const copied = await sha256File(destination);
  if (copied.bytes !== Number(reference.byte_size) || copied.sha256 !== reference.sha256) {
    throw new Error(`Photo changed during backup: ${reference.storage_name}`);
  }
  return { path: relative, kind, ...copied };
}

export async function createBackup(options: BackupOptions): Promise<BackupResult> {
  if (!options.databaseUrl) throw new Error("DATABASE_URL is required");
  const requestedDestination = path.resolve(options.destinationRoot);
  await assertNonOverlappingPaths(requestedDestination, options.attachmentsDir);
  const destinationRoot = await realDirectory(requestedDestination);
  const id = backupId(options.now ?? new Date());
  const partialDir = path.join(destinationRoot, `${id}.partial`);
  const finalDir = path.join(destinationRoot, id);
  await mkdir(partialDir, { mode: 0o750 });
  await mkdir(path.join(partialDir, "photos"), { mode: 0o750 });
  const target = new Pool({ connectionString: options.databaseUrl, max: 2 });

  try {
    const manifest = await withBackupSnapshotLocks(target, async (client) => {
      const storage = await verifyStorage(target, options.attachmentsDir);
      if (
        storage.unknownOrphans.length ||
        storage.brokenReferences.length ||
        storage.hashMismatches.length
      ) {
        throw new Error("Storage verification failed before backup");
      }
      const migrations = await client.query<{ name: string; checksum: string }>(
        "SELECT name,checksum FROM schema_migrations ORDER BY name",
      );
      const active = await client.query<PhotoReference>(
        "SELECT storage_name,sha256,byte_size::text FROM photos ORDER BY storage_name",
      );
      const pending = await client.query<PhotoReference>(
        "SELECT storage_name,sha256,byte_size::text FROM photo_cleanup_queue ORDER BY storage_name",
      );
      const archivePath = path.join(partialDir, "database.dump");
      const pgDump = await resolvePgTool("pg_dump", options.pgDumpPath ?? process.env.PG_DUMP_BIN);
      await runProcess(
        pgDump,
        ["--format=custom", "--no-owner", "--no-privileges", `--file=${archivePath}`],
        postgresEnvironment(options.databaseUrl),
      );
      await chmod(archivePath, 0o600);
      const files: BackupFile[] = [
        { path: "database.dump", kind: "database", ...(await sha256File(archivePath)) },
      ];
      for (const reference of active.rows) {
        files.push(
          await copyVerifiedPhoto(
            options.attachmentsDir,
            partialDir,
            reference,
            "active-photo",
          ),
        );
      }
      const pendingByName = new Map(
        storage.pendingCleanup.map((entry) => [entry.storageName, entry.exists]),
      );
      const pendingCleanupMissing: BackupManifest["pendingCleanupMissing"] = [];
      for (const reference of pending.rows) {
        if (pendingByName.get(reference.storage_name)) {
          files.push(
            await copyVerifiedPhoto(
              options.attachmentsDir,
              partialDir,
              reference,
              "pending-cleanup-photo",
            ),
          );
        } else {
          pendingCleanupMissing.push({
            storageName: reference.storage_name,
            bytes: Number(reference.byte_size),
            sha256: reference.sha256,
          });
        }
      }
      return {
        format: "couple-home-backup",
        formatVersion: 1,
        backupId: id,
        createdAt: (options.now ?? new Date()).toISOString(),
        schemaMigrations: migrations.rows,
        files,
        pendingCleanupMissing,
        totalBytes: files.reduce((sum, entry) => sum + entry.bytes, 0),
      } satisfies BackupManifest;
    });

    await writeEncodedManifest(partialDir, encodeManifest(manifest));
    await rename(partialDir, finalDir);
    return { backupId: id, directory: finalDir, manifest };
  } catch (error) {
    await rm(partialDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    await target.end();
  }
}
