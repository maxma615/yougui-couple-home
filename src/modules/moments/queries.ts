import type { Pool, PoolClient } from "pg";

import type { ResourceRow } from "@/lib/resource-service";
import type { MomentPhoto } from "@/modules/moments/schema";

type QueryTarget = Pool | PoolClient;

type PhotoRow = {
  id: string;
  moment_id: string;
  filename: string;
  mime: MomentPhoto["mime"];
  bytes: string;
};

export type Moment = ResourceRow & {
  title: string;
  date: string;
  body: string;
  photos: MomentPhoto[];
};

export async function attachPhotos(
  rows: ResourceRow[],
  homeId: string,
  target: QueryTarget,
): Promise<Moment[]> {
  if (rows.length === 0) return [];
  const result = await target.query<PhotoRow>(
    `SELECT id,moment_id,original_filename AS filename,mime_type AS mime,byte_size::text AS bytes
     FROM photos WHERE home_id=$1 AND moment_id=ANY($2::uuid[])
     ORDER BY created_at,id`,
    [homeId, rows.map((row) => row.id)],
  );
  const byMoment = new Map<string, MomentPhoto[]>();
  for (const row of result.rows) {
    const photos = byMoment.get(row.moment_id) ?? [];
    photos.push({ id: row.id, filename: row.filename, mime: row.mime, bytes: Number(row.bytes) });
    byMoment.set(row.moment_id, photos);
  }
  return rows.map((row) => ({ ...row, photos: byMoment.get(row.id) ?? [] })) as Moment[];
}

