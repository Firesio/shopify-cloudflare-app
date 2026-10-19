import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { adminUsers } from "./admin-users";

/**
 * Who on our staff touched what in the internal console, and when.
 *
 * One row per authenticated console request (`access`, with method and path)
 * plus the sign-in events that matter for an investigation. The console shows
 * merchants' emails and support conversations, so "who looked at this shop's
 * data" must be answerable after the fact.
 *
 * Deliberately minimal: no query string (search boxes can hold an email), no
 * IP, no user agent, no request body. `shop` is filled when the path names one,
 * so the tenant purge erases a redacted shop's trail with the rest of its rows.
 * `actor_email` is a snapshot, so the trail survives the staff account being
 * deleted (`admin_user_id` then becomes null).
 */
export const staffAuditLogs = sqliteTable(
  "staff_audit_logs",
  {
    id: text("id").primaryKey(),
    adminUserId: text("admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    actorEmail: text("actor_email").notNull(),
    kind: text("kind", {
      enum: ["access", "login", "logout", "mfa_challenge_failed", "mfa_enabled", "mfa_disabled", "mfa_reset", "recovery_code_used"],
    }).notNull(),
    method: text("method"),
    path: text("path"),
    shop: text("shop"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("staff_audit_logs_created_idx").on(table.createdAt),
    index("staff_audit_logs_actor_created_idx").on(table.adminUserId, table.createdAt),
    index("staff_audit_logs_shop_idx").on(table.shop),
  ],
);

export type StaffAuditLog = typeof staffAuditLogs.$inferSelect;
export type StaffAuditKind = StaffAuditLog["kind"];
