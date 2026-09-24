import type { Pool, PoolClient } from "pg";

import { pool, transaction } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { publishHomeEvent } from "@/lib/events/publisher";
import {
  createResourceService,
  requireResourceId,
  requireVersion,
  type ResourceContext,
  type ResourceRow,
} from "@/lib/resource-service";
import { attachPhotos, type Moment } from "@/modules/moments/queries";
import { parseMomentInput } from "@/modules/moments/schema";

export function createMomentService(target: Pool = pool) {
  const base = createResourceService(
    {
      table: "moments",
      type: "moment",
      columns: { title: "title", date: "date", body: "body" },
      dates: ["date"],
      orderBy: "date DESC,created_at DESC,id DESC",
      parse: parseMomentInput,
    },
    target,
  );

  async function hydrated(
    ctx: ResourceContext,
    row: ResourceRow,
    connection: Pool | PoolClient = target,
  ): Promise<Moment> {
    return (await attachPhotos([row], ctx.homeId, connection))[0];
  }

  return {
    async list(ctx: ResourceContext): Promise<Moment[]> {
      return attachPhotos(await base.list(ctx), ctx.homeId, target);
    },
    async get(ctx: ResourceContext, id: string): Promise<Moment> {
      return hydrated(ctx, await base.get(ctx, id));
    },
    async create(ctx: ResourceContext, input: unknown): Promise<Moment> {
      return hydrated(ctx, await base.create(ctx, input));
    },
    async update(ctx: ResourceContext, id: string, input: unknown): Promise<Moment> {
      try {
        return hydrated(ctx, await base.update(ctx, id, input));
      } catch (error) {
        if (error instanceof AppError && error.status === 409) {
          const current = await hydrated(ctx, await base.get(ctx, id));
          throw new AppError(error.status, error.code, error.message, error.fields, current);
        }
        throw error;
      }
    },
    async remove(ctx: ResourceContext, id: string, version: unknown): Promise<void> {
      requireResourceId(id);
      const expected = requireVersion(version);
      await transaction(async (tx) => {
        const current = await base.get(ctx, id, tx, true);
        if (current.version !== expected) {
          throw new AppError(
            409,
            "VERSION_CONFLICT",
            "另一位成员已经修改了这条内容，请比较后再删除",
            undefined,
            await hydrated(ctx, current, tx),
          );
        }
        await tx.query(
          `INSERT INTO photo_cleanup_queue(storage_name,home_id,photo_id,sha256,byte_size)
           SELECT storage_name,home_id,id,sha256,byte_size FROM photos
           WHERE home_id=$1 AND moment_id=$2
           ON CONFLICT(storage_name) DO NOTHING`,
          [ctx.homeId, id],
        );
        await tx.query("DELETE FROM moments WHERE home_id=$1 AND id=$2", [ctx.homeId, id]);
        await publishHomeEvent(tx, {
          homeId: ctx.homeId,
          type: "moment",
          resourceId: id,
          action: "deleted",
          version: current.version + 1,
        });
      }, target);
    },
  };
}

export const moments = createMomentService();
