import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";

import { loadConfig } from "@/lib/config";
import { pool } from "@/lib/db";
import { safeStoragePath } from "@/modules/photos/store";

type StoredReference = {
  storage_name: string;
  sha256: string;
  byte_size: string;
};

export type StorageVerificationReport = {
  valid: string[];
  pendingCleanup: Array<{ storageName: string; exists: boolean }>;
  unknownOrphans: string[];
  brokenReferences: string[];
  hashMismatches: string[];
  summary: {
    valid: number;
    pendingCleanup: number;
    unknownOrphans: number;
    brokenReferences: number;
    hashMismatches: number;
  };
};

async function fileNames(directory: string, child: "photos" | "tmp"): Promise<string[]> {
  try {
    const entries = await readdir(path.join(directory, child), { withFileTypes: true });
    return entries.map((entry) => entry.name).sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

type MatchResult = "valid" | "mismatch" | "missing" | "invalid";

async function matches(reference: StoredReference, directory: string): Promise<MatchResult> {
  let handle;
  try {
    handle = await open(
      safeStoragePath(directory, reference.storage_name),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const details = await handle.stat();
    if (!details.isFile()) return "invalid";
    const bytes = await handle.readFile();
    return bytes.length === Number(reference.byte_size) &&
      createHash("sha256").update(bytes).digest("hex") === reference.sha256
        ? "valid"
        : "mismatch";
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      if (error.code === "ENOENT") return "missing";
      if (error.code === "ELOOP" || error.code === "EFTYPE" || error.code === "EISDIR") {
        return "invalid";
      }
    }
    throw error;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export async function verifyStorage(
  target: Pool = pool,
  attachmentsDirectory = loadConfig().attachmentsDir,
): Promise<StorageVerificationReport> {
  const [activeResult, pendingResult, diskNames, temporaryNames] = await Promise.all([
    target.query<StoredReference>("SELECT storage_name,sha256,byte_size::text FROM photos ORDER BY storage_name"),
    target.query<StoredReference>(
      "SELECT storage_name,sha256,byte_size::text FROM photo_cleanup_queue ORDER BY storage_name",
    ),
    fileNames(attachmentsDirectory, "photos"),
    fileNames(attachmentsDirectory, "tmp"),
  ]);
  const valid: string[] = [];
  const brokenReferences: string[] = [];
  const hashMismatches: string[] = [];
  for (const reference of activeResult.rows) {
    const result = await matches(reference, attachmentsDirectory);
    if (result === "missing" || result === "invalid") brokenReferences.push(reference.storage_name);
    else if (result === "valid") valid.push(reference.storage_name);
    else hashMismatches.push(reference.storage_name);
  }
  const disk = new Set(diskNames);
  const pendingCleanup: Array<{ storageName: string; exists: boolean }> = [];
  for (const reference of pendingResult.rows) {
    const exists = disk.has(reference.storage_name);
    pendingCleanup.push({ storageName: reference.storage_name, exists });
    if (exists) {
      const result = await matches(reference, attachmentsDirectory);
      if (result === "invalid" || result === "mismatch") {
        hashMismatches.push(reference.storage_name);
      }
    }
  }
  const known = new Set([
    ...activeResult.rows.map((row) => row.storage_name),
    ...pendingResult.rows.map((row) => row.storage_name),
  ]);
  const unknownOrphans = [
    ...diskNames.filter((name) => !known.has(name)),
    ...temporaryNames.map((name) => `tmp/${name}`),
  ];
  const report = { valid, pendingCleanup, unknownOrphans, brokenReferences, hashMismatches };
  return {
    ...report,
    summary: Object.fromEntries(
      Object.entries(report).map(([key, value]) => [key, value.length]),
    ) as StorageVerificationReport["summary"],
  };
}

async function main(): Promise<void> {
  try {
    const report = await verifyStorage();
    console.log(JSON.stringify(report, null, 2));
    if (
      report.unknownOrphans.length > 0 ||
      report.brokenReferences.length > 0 ||
      report.hashMismatches.length > 0
    ) {
      process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Storage verification failed");
    process.exitCode = 1;
  });
}
