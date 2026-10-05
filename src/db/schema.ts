import {
  check,
  boolean,
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

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").unique("users_email_key"),
    phone: text("phone").unique("users_phone_key"),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").default("member").notNull(),
    disabled: boolean("disabled").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check("users_phone_check", sql`${table.phone} IS NULL OR ${table.phone} ~ '^1[3-9][0-9]{9}$'`),
    check("users_role_check", sql`${table.role} IN ('member','admin')`),
    check("users_login_identifier_check", sql`${table.email} IS NOT NULL OR ${table.phone} IS NOT NULL`),
  ],
);

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
