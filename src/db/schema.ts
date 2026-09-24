import {
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique("users_email_key"),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const homes = pgTable(
  "homes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("homes_version_check", sql`${table.version} >= 1`)],
);

export const homeMembers = pgTable(
  "home_members",
  {
    homeId: uuid("home_id")
      .notNull()
      .references(() => homes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
  },
  (table) => [
    primaryKey({ name: "home_members_pkey", columns: [table.homeId, table.userId] }),
    unique("home_members_user_id_key").on(table.userId),
    unique("home_members_home_id_slot_key").on(table.homeId, table.slot),
    check("home_members_slot_check", sql`${table.slot} BETWEEN 1 AND 2`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);
