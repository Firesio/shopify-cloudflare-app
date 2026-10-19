import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { adminUsers } from "./admin-users";

/**
 * A staff member's TOTP (RFC 6238) second factor for the internal console.
 *
 * Its own table, not columns on `admin_users`: that table is read whole on
 * every session lookup, and a secret must never ride along into an object that
 * is later treated as safe to render.
 *
 * Secrets are stored ENCRYPTED (AES-GCM, key derived from the `STAFF_MFA_KEY`
 * secret; see app/lib/secret-box.ts), never in clear. A D1 export alone does not
 * give anyone a working authenticator.
 *
 *   pending_secret — set when enrollment starts, cleared when a code confirms it
 *   secret         — the confirmed secret; non-null means MFA is ON
 *   last_step      — the newest TOTP time step accepted, so a code is single-use
 */
export const adminMfa = sqliteTable("admin_mfa", {
  adminUserId: text("admin_user_id")
    .primaryKey()
    .references(() => adminUsers.id, { onDelete: "cascade" }),
  secret: text("secret"),
  pendingSecret: text("pending_secret"),
  pendingCreatedAt: integer("pending_created_at"),
  enabledAt: integer("enabled_at"),
  lastStep: integer("last_step"),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * Single-use recovery codes, for a lost authenticator. ONLY A HASH is stored
 * (SHA-256: the codes are 80 random bits, so no slow hash is needed). Spent codes
 * keep their row with `used_at` set, so a reuse can be reported as such.
 */
export const adminRecoveryCodes = sqliteTable(
  "admin_recovery_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("admin_recovery_codes_user_idx").on(table.adminUserId)],
);

export type AdminMfa = typeof adminMfa.$inferSelect;
