import { realpath } from "node:fs/promises";
import path from "node:path";

async function canonicalCandidate(value: string): Promise<string> {
  let cursor = path.resolve(value);
  const missing: string[] = [];
  while (true) {
    try {
      return path.join(await realpath(cursor), ...missing);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

export async function assertNonOverlappingPaths(
  first: string,
  second: string,
): Promise<void> {
  const [canonicalFirst, canonicalSecond] = await Promise.all([
    canonicalCandidate(first),
    canonicalCandidate(second),
  ]);
  if (contains(canonicalFirst, canonicalSecond) || contains(canonicalSecond, canonicalFirst)) {
    throw new Error("Backup and attachment paths must not overlap");
  }
}
