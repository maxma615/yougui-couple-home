import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { homes, users } from "@/db/schema";

export const invitations = pgTable(
  "invitations",
  {
    tokenHash: text("token_hash").primaryKey(),
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    consumedBy: uuid("consumed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("invitations_home_id_idx").on(table.homeId),
    index("invitations_expires_at_idx").on(table.expiresAt),
  ],
);
