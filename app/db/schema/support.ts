import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { SUPPORT_CATEGORIES } from "~/support/categories";
import { SUPPORT_SOURCES } from "~/support/inbound/types";


/**
 * Merchant ↔ staff support threads. Merchants file and reply from the embedded
 * admin (`/app/support`); staff answer from the internal console
 * (`/internal/support`).
 *
 * `shopName` and `merchantEmail` are SNAPSHOTS taken when the ticket is filed,
 * not joins. A thread has to stay readable and answerable after the shop
 * uninstalls — at which point the live Shopify record is gone — and the address
 * the merchant wanted replies sent to is a property of the ticket, not of the
 * shop's current configuration.
 */
export const supportTickets = sqliteTable(
  "support_tickets",
  {
    id: text("id").primaryKey(),
    /**
     * NULL for a conversation that no shop owns yet (a mail from a stranger, a
     * public-form message). A NULL never equals a shop, so every shop-scoped
     * query and the shop purge pass over these rows by construction; staff
     * assign one later and it becomes an ordinary shop thread.
     */
    shop: text("shop"),
    /** Where the conversation started; decides how replies are delivered. */
    source: text("source", { enum: SUPPORT_SOURCES }).notNull().default("app_portal"),
    /**
     * The address of whoever started a conversation that has no merchant
     * record (the Reply-To of a Shopify relay, the sender of a mail). Replies go
     * here for those sources; null for the portal, which uses `merchantEmail`.
     */
    replyAddress: text("reply_address"),
    /** Snapshot — see the note above. For a stranger: their name, or address. */
    shopName: text("shop_name").notNull(),
    /** Where staff replies are emailed. Prefilled from Shopify, editable by the merchant. */
    merchantEmail: text("merchant_email"),
    /**
     * Extra addresses copied on every reply — a shared inbox, a colleague.
     * JSON because it is a short bounded list read and written whole, never
     * queried by element. Capped and deduped at the edge (app/schemas/support.ts).
     */
    ccEmails: text("cc_emails", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    // The one list, shared with the picker and the labels, so a new category
    // cannot exist in the UI and be rejected by the column (or vice versa).
    category: text("category", { enum: SUPPORT_CATEGORIES }).notNull(),
    subject: text("subject").notNull(),
    /**
     * There is deliberately NO `status` column.
     *
     * "Whose turn is it" IS "who spoke last": the merchant wrote, so it is ours;
     * we wrote, so it is theirs. Storing that as a third fact lets it disagree
     * with the messages — the classic helpdesk bug where a thread shows a reply
     * but still reads OPEN. So the two facts below are written in the same
     * operation as every message, and the status a human sees is DERIVED from
     * them by a pure function (`app/support/status.ts`).
     *
     * It also makes reopen-on-reply free: a merchant answering a closed ticket
     * clears `closedAt` in that same write, and nothing else has to know.
     */
    lastAuthor: text("last_author", { enum: ["merchant", "staff"] }).notNull(),
    /** Sort key for the queue, and half of the unread comparison below. */
    lastMessageAt: integer("last_message_at").notNull(),
    /** Null while the thread is live. Set when either side closes it. */
    closedAt: integer("closed_at"),
    /**
     * Read receipts as TIMESTAMPS, not booleans: unread is
     * `lastMessageAt > xLastReadAt`, which cannot drift out of step with the
     * messages the way a flag someone forgot to clear does. Null = never opened.
     */
    merchantLastReadAt: integer("merchant_last_read_at"),
    staffLastReadAt: integer("staff_last_read_at"),
    /**
     * The merchant's language when they opened the ticket, so a reply written
     * days later still reaches them in it.
     *
     * Captured HERE rather than resolved at send time: staff answer from the
     * internal console, and that request knows nothing about the merchant. Null
     * for tickets opened before this column existed — the sender falls back to
     * the default locale rather than guessing.
     */
    locale: text("locale"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("support_tickets_shop_idx").on(table.shop),
    // The staff queue: live threads waiting on us, newest first. Covers the
    // derived-status filter without a stored status column.
    index("support_tickets_queue_idx").on(
      table.closedAt,
      table.lastAuthor,
      table.lastMessageAt,
    ),
    index("support_tickets_shop_recent_idx").on(table.shop, table.lastMessageAt),
  ],
);

export type SupportTicket = typeof supportTickets.$inferSelect;
export type NewSupportTicket = typeof supportTickets.$inferInsert;

/** Server-owned metadata for an object uploaded before its message is submitted. */
export const pendingUploads = sqliteTable(
  "pending_uploads",
  {
    id: text("id").primaryKey(),
    shop: text("shop").notNull(),
    ticketId: text("ticket_id"),
    r2Key: text("r2_key").notNull().unique(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    adoptedAt: integer("adopted_at"),
  },
  (table) => [
    index("pending_uploads_shop_idx").on(table.shop, table.createdAt),
    index("pending_uploads_expiry_idx").on(table.expiresAt),
  ],
);

export type PendingUpload = typeof pendingUploads.$inferSelect;

/**
 * One message in a thread. `authorName` is a snapshot for the same reason the
 * ticket's shopName is: a staff account can be renamed or deleted, and the
 * thread still has to say who wrote what.
 */
export const supportMessages = sqliteTable(
  "support_messages",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    /**
     * Kept alongside ticketId so a purge and every read stay shop-scoped without
     * a join. NULL while the thread is unassigned; assigning a shop rewrites it.
     */
    shop: text("shop"),
    /** `merchant` means the CUSTOMER side, whoever they are; `staff` is us. */
    author: text("author", { enum: ["merchant", "staff"] }).notNull(),
    /** Snapshot — see the note above. */
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    /**
     * The `Message-ID` of a mail that arrived. Unique, so a delivery repeated
     * by the mail system is one message; null for portal and staff messages.
     */
    externalId: text("external_id"),
    /** The id Email Service returned for the mail we sent for this message. */
    mailId: text("mail_id"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("support_messages_external_id_idx").on(table.externalId),
    index("support_messages_mail_id_idx").on(table.mailId),
    index("support_messages_ticket_idx").on(table.ticketId, table.createdAt),
    index("support_messages_shop_idx").on(table.shop),
  ],
);

export type SupportMessage = typeof supportMessages.$inferSelect;
export type NewSupportMessage = typeof supportMessages.$inferInsert;
export type SupportAuthor = SupportMessage["author"];

/**
 * An image or video attached to a message, stored in R2.
 *
 * `r2Key` is the only handle on the object; it is read during a shop purge to
 * delete the blob before the row that names it disappears. A row without its
 * object is a broken thumbnail; an object without its row is an unreachable
 * bill, so the row is deleted second.
 */
export const supportAttachments = sqliteTable(
  "support_attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => supportMessages.id, { onDelete: "cascade" }),
    /** Kept for the same reason as on supportMessages: purge and reads stay shop-scoped. */
    shop: text("shop").notNull(),
    r2Key: text("r2_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("support_attachments_message_idx").on(table.messageId),
    index("support_attachments_shop_idx").on(table.shop),
  ],
);

export type SupportAttachment = typeof supportAttachments.$inferSelect;
export type NewSupportAttachment = typeof supportAttachments.$inferInsert;
