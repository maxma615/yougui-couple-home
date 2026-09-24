import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BACKUP_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{12}$/;
const STORAGE_NAME_PATTERN = /^[0-9a-f]{32}\.(jpg|png|webp)$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const MANIFEST_MAX_BYTES = 64 * 1024 * 1024;

export type BackupFileKind = "database" | "active-photo" | "pending-cleanup-photo";

export type BackupFile = {
  path: string;
  kind: BackupFileKind;
  bytes: number;
  sha256: string;
};

export type BackupManifest = {
  format: "couple-home-backup";
  formatVersion: 1;
  backupId: string;
  createdAt: string;
  schemaMigrations: Array<{ name: string; checksum: string }>;
  files: BackupFile[];
  pendingCleanupMissing: Array<{ storageName: string; bytes: number; sha256: string }>;
  totalBytes: number;
};

export function assertBackupId(value: string): void {
  if (!BACKUP_ID_PATTERN.test(value)) throw new Error("Invalid backup directory name");
}

export function photoBackupPath(storageName: string): string {
  if (!STORAGE_NAME_PATTERN.test(storageName)) throw new Error("Invalid photo storage name");
  return `photos/${storageName}`;
}

export async function sha256File(filePath: string): Promise<{ bytes: number; sha256: string }> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    let bytes = 0;
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    stream.once("error", reject);
    stream.once("end", () => resolve({ bytes, sha256: hash.digest("hex") }));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseFile(value: unknown): BackupFile {
  if (!isRecord(value)) throw new Error("Invalid backup manifest file entry");
  const allowed = new Set(["database", "active-photo", "pending-cleanup-photo"]);
  if (
    typeof value.path !== "string" ||
    typeof value.kind !== "string" ||
    !allowed.has(value.kind) ||
    !safeInteger(value.bytes) ||
    typeof value.sha256 !== "string" ||
    !SHA256_PATTERN.test(value.sha256)
  ) {
    throw new Error("Invalid backup manifest file entry");
  }
  const expectedPath =
    value.kind === "database"
      ? "database.dump"
      : photoBackupPath(path.posix.basename(value.path));
  if (value.path !== expectedPath || path.posix.normalize(value.path) !== value.path) {
    throw new Error("Unsafe backup manifest path");
  }
  return value as BackupFile;
}

export function parseManifest(value: unknown): BackupManifest {
  if (!isRecord(value)) throw new Error("Invalid backup manifest");
  assertBackupId(typeof value.backupId === "string" ? value.backupId : "");
  if (
    value.format !== "couple-home-backup" ||
    value.formatVersion !== 1 ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Array.isArray(value.schemaMigrations) ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.pendingCleanupMissing) ||
    !safeInteger(value.totalBytes)
  ) {
    throw new Error("Invalid backup manifest");
  }
  const schemaMigrations = value.schemaMigrations.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.name !== "string" ||
      !/^\d{4}_[a-z0-9_-]+\.sql$/.test(entry.name) ||
      typeof entry.checksum !== "string" ||
      !SHA256_PATTERN.test(entry.checksum)
    ) {
      throw new Error("Invalid schema migration entry");
    }
    return { name: entry.name, checksum: entry.checksum };
  });
  const files = value.files.map(parseFile);
  const pendingCleanupMissing = value.pendingCleanupMissing.map((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.storageName !== "string" ||
      !STORAGE_NAME_PATTERN.test(entry.storageName) ||
      !safeInteger(entry.bytes) ||
      typeof entry.sha256 !== "string" ||
      !SHA256_PATTERN.test(entry.sha256)
    ) {
      throw new Error("Invalid missing cleanup entry");
    }
    return entry as { storageName: string; bytes: number; sha256: string };
  });
  if (new Set(files.map((entry) => entry.path)).size !== files.length) {
    throw new Error("Duplicate backup manifest path");
  }
  if (files.filter((entry) => entry.kind === "database").length !== 1) {
    throw new Error("Backup manifest must contain one database archive");
  }
  if (files.reduce((sum, entry) => sum + entry.bytes, 0) !== value.totalBytes) {
    throw new Error("Backup manifest byte total mismatch");
  }
  return {
    format: "couple-home-backup",
    formatVersion: 1,
    backupId: value.backupId as string,
    createdAt: value.createdAt as string,
    schemaMigrations,
    files,
    pendingCleanupMissing,
    totalBytes: value.totalBytes,
  };
}

function assertManifestSize(bytes: Uint8Array): void {
  if (bytes.byteLength > MANIFEST_MAX_BYTES) {
    throw new Error(
      `Backup manifest is too large (${bytes.byteLength} bytes; maximum ${MANIFEST_MAX_BYTES})`,
    );
  }
}

export function encodeManifest(manifest: BackupManifest): Buffer {
  const normalized = parseManifest(manifest);
  const bytes = Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  assertManifestSize(bytes);
  return bytes;
}

export function parseManifestBytes(bytes: Uint8Array): BackupManifest {
  assertManifestSize(bytes);
  return parseManifest(JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown);
}

export async function writeEncodedManifest(directory: string, bytes: Buffer): Promise<void> {
  assertManifestSize(bytes);
  const manifestHash = createHash("sha256").update(bytes).digest("hex");
  await writeFile(path.join(directory, "manifest.json"), bytes, { flag: "wx", mode: 0o600 });
  await writeFile(path.join(directory, "COMPLETE"), `${manifestHash}\n`, {
    flag: "wx",
    mode: 0o600,
  });
}

async function collectEntries(root: string, relative = ""): Promise<string[]> {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    const childPath = path.join(root, ...child.split("/"));
    const details = await lstat(childPath);
    if (details.isSymbolicLink()) throw new Error("Backup contains a symbolic link");
    if (details.isDirectory()) found.push(...(await collectEntries(root, child)));
    else if (details.isFile()) found.push(child);
    else throw new Error("Backup contains an unsupported filesystem entry");
  }
  return found.sort();
}

export async function verifyBackupDirectory(backupDir: string): Promise<BackupManifest> {
  const root = path.resolve(backupDir);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error("Backup path must be a real directory");
  }
  assertBackupId(path.basename(root));
  const manifestPath = path.join(root, "manifest.json");
  const completePath = path.join(root, "COMPLETE");
  const metadataSizes = new Map([[manifestPath, MANIFEST_MAX_BYTES], [completePath, 128]]);
  for (const [required, maximumBytes] of metadataSizes) {
    const details = await lstat(required);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new Error("Backup contains a symbolic link or non-file metadata entry");
    }
    if (details.size > maximumBytes) throw new Error("Backup metadata file is too large");
  }
  const manifestBytes = await readFile(manifestPath);
  const manifest = parseManifestBytes(manifestBytes);
  if (manifest.backupId !== path.basename(root)) throw new Error("Backup ID does not match directory");
  const completion = (await readFile(completePath, "utf8")).trim();
  const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
  if (completion !== manifestHash) throw new Error("Backup completion marker checksum mismatch");

  const expected = new Set(["COMPLETE", "manifest.json", ...manifest.files.map((entry) => entry.path)]);
  const actual = await collectEntries(root);
  if (actual.length !== expected.size || actual.some((entry) => !expected.has(entry))) {
    throw new Error("Backup contains missing or unexpected files");
  }
  for (const entry of manifest.files) {
    const candidate = path.join(root, ...entry.path.split("/"));
    const details = await lstat(candidate);
    if (!details.isFile() || details.isSymbolicLink()) throw new Error("Unsafe backup payload file");
    const actualHash = await sha256File(candidate);
    if (actualHash.bytes !== entry.bytes || actualHash.sha256 !== entry.sha256) {
      throw new Error(`Backup checksum mismatch for ${entry.path}`);
    }
  }
  return manifest;
}
