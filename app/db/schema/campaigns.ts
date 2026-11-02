import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { adminUsers } from "./admin-users";
import { CAMPAIGN_STATUSES } from "~/domain/campaign";
import { PAUSE_REASONS } from "~/domain/campaign-delivery";

/**
 * Announcements sent to many merchants at once.
 *
 * NOT shop-scoped, like `admin_users`: a campaign belongs to our team, not to a merchant. The rows that DO name a
 * shop are `campaign_recipients`, which carries `shop` and is erased with the rest of that shop's rows.
 */
export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    /** For the team's own list; merchants never see it. */
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    /** Plain text, a blank line between paragraphs. */
    body: text("body").notNull(),
    ctaLabel: text("cta_label"),
    ctaUrl: text("cta_url"),
    /** An `AudienceFilter` as JSON, read back through `audienceFilterSchema` because stored values outlive the code. */
    audience: text("audience").notNull(),
    status: text("status", { enum: CAMPAIGN_STATUSES }).notNull().default("draft"),
    /** Why delivery stopped by itself; null for a pause someone chose, or while not paused. */
    pauseReason: text("pause_reason", { enum: PAUSE_REASONS }),
    /** Fixed when sending starts; null for a draft. */
    recipientCount: integer("recipient_count"),
    /** Kept as a snapshot so the record survives the account being deleted. */
    createdBy: text("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    startedAt: integer("started_at"),
    completedAt: integer("completed_at"),
    /** When the delivery chain last ran; a `sending` campaign whose chain went quiet is restarted from this. */
    lastPumpAt: integer("last_pump_at"),
  },
  (table) => [
    // The list is newest first; the watchdog looks for `sending` ones.
    index("campaigns_created_idx").on(table.createdAt),
    index("campaigns_status_idx").on(table.status),
  ],
);

export type CampaignRow = typeof campaigns.$inferSelect;

/**
 * The people one campaign goes to, fixed the moment sending starts, so progress, retries and "who got this?" have an
 * answer that does not move when shops install or uninstall afterwards.
 *
 * Carries `shop`, so the tenant purge erases it (`models/tenant-purge.server.ts`).
 */
export const campaignRecipients = sqliteTable(
  "campaign_recipients",
  {
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    shop: text("shop").notNull(),
    shopName: text("shop_name").notNull(),
    /** Lower-cased. */
    email: text("email").notNull(),
    status: text("status", { enum: ["pending", "sent", "failed", "refused", "skipped"] })
      .notNull()
      .default("pending"),
    /** Why it did not go: a RefusalReason or FailureReason from the notification log, or `unsubscribed`/`cancelled`. */
    reasonCode: text("reason_code"),
    /** Transient errors so far; at the limit it becomes `failed`. */
    attempts: integer("attempts").notNull().default(0),
    settledAt: integer("settled_at"),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.shop] }),
    // Counting by status and taking the next pending page both filter on these two.
    index("campaign_recipients_status_idx").on(table.campaignId, table.status),
  ],
);

export type CampaignRecipientRow = typeof campaignRecipients.$inferSelect;
export type CampaignRecipientStatus = CampaignRecipientRow["status"];

/**
 * Addresses that asked to stop receiving announcements.
 *
 * KEYED ON THE ADDRESS, and holding the address itself (lower-cased), because the audience query must be able to ask
 * "is this shop's address on the list?" in SQL and a hash cannot be joined against. It is a suppression list, so it is
 * deliberately NOT erased by `shop/redact`: a merchant who was erased and reinstalls must not be written to again.
 * It holds nothing but the address, the time and how they asked.
 *
 * Separate from `notification_opt_outs`, which silences a whole CHANNEL (including support replies) and so is the
 * wrong tool for "no more announcements".
 */
export const campaignUnsubscribes = sqliteTable("campaign_unsubscribes", {
  address: text("address").primaryKey(),
  unsubscribedAt: integer("unsubscribed_at").notNull(),
  /** How they asked: "link" for the unsubscribe page, "staff" if the team recorded it. */
  source: text("source").notNull(),
});
