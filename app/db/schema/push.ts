import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
import { adminUsers } from "./admin-users";

/**
 * A browser or device a staff member registered to receive Web Push.
 *
 * NOT shop-scoped, like `admin_users` it belongs to: these rows are our own
 * team's. They are scoped by `admin_user_id` instead, and every admin-facing
 * query filters on it (`PushSubscriptionRepo`). There is deliberately no `shop`
 * column, so the tenant purge never touches it.
 *
 * `endpoint` is a capability URL: whoever holds it (with the keys) can send to
 * the device. It is unique, so one browser registration is one row, and
 * registering it again moves it to whoever registered last.
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** "Chrome on Android", derived from the user agent when registering. */
    label: text("label").notNull(),
    kind: text("kind", { enum: ["phone", "tablet", "desktop"] }).notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
    lastUsedAt: integer("last_used_at"),
  },
  (table) => [index("push_subscriptions_admin_user_idx").on(table.adminUserId)],
);

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;

/**
 * One staff member's stored on/off choice for (topic, channel).
 *
 * ABSENCE IS THE DEFAULT: no row means the topic's default in
 * `STAFF_TOPIC_SPECS`, which is what lets a new topic ship without a migration.
 * `topic` and `channel` are plain text validated against the catalogue in code
 * (`isStaffTopic`), so a retired topic degrades to "ignored" rather than a
 * failed read. Not shop-scoped, for the same reason as `push_subscriptions`.
 */
export const adminNotificationPreferences = sqliteTable(
  "admin_notification_preferences",
  {
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    channel: text("channel").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.adminUserId, table.topic, table.channel] })],
);

export type AdminNotificationPreferenceRow = typeof adminNotificationPreferences.$inferSelect;
