import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { SUPPORT_SOURCES } from "~/support/inbound/types";
import { SPAM_REASONS } from "~/support/triage/types";

/**
 * Mail held back as probable spam, waiting for a person to release or discard it.
 *
 * A TABLE OF ITS OWN rather than a flag on `support_tickets`: a held mail is not a conversation, so no queue,
 * unread count, push badge or MCP listing can ever include one by forgetting a `WHERE`. Releasing it is the only
 * way in, and that opens an ordinary ticket.
 *
 * NO `shop` column, deliberately: this is a stranger's mail that no shop owns, and `shop_hint` is only what the
 * mail CLAIMED (re-checked against the shops we know when it is released). It is not erased with a shop; the
 * retention sweep deletes it (`support_quarantine` in `app/domain/retention.ts`). Not a precedent.
 */
export const supportQuarantine = sqliteTable(
  "support_quarantine",
  {
    id: text("id").primaryKey(),
    /** The mail's own `Message-ID`, normalised. Unique: the same mail delivered twice is held once. */
    externalId: text("external_id").notNull(),
    source: text("source", { enum: SUPPORT_SOURCES }).notNull(),
    reason: text("reason", { enum: SPAM_REASONS }).notNull(),
    senderEmail: text("sender_email").notNull(),
    senderName: text("sender_name").notNull(),
    shopHint: text("shop_hint"),
    shopName: text("shop_name"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("support_quarantine_external_id_idx").on(table.externalId),
    // The console lists newest first, and the retention sweep reads the oldest through the same index.
    index("support_quarantine_created_idx").on(table.createdAt),
    index("support_quarantine_sender_idx").on(table.senderEmail),
  ],
);

export type SupportQuarantineRow = typeof supportQuarantine.$inferSelect;

/**
 * Senders staff refuse: a full address or a bare domain, stored lower-cased (`parseSenderPattern`). The list is
 * small and read whole, so there is no per-row lookup. Same exemption from `shop` as the table above.
 */
export const supportBlockedSenders = sqliteTable("support_blocked_senders", {
  pattern: text("pattern").primaryKey(),
  /** The staff member who added it, for the question "who blocked this?". */
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type SupportBlockedSender = typeof supportBlockedSenders.$inferSelect;
