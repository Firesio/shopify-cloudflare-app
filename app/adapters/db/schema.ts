import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * The tables THIS app owns. The libraries' tables (webhook inbox and redaction tombstones, plan usage, support, members,
 * content edits, push devices, AI, the portal outbox) come from their `/d1` schemas, which `drizzle.config.ts` lists next to
 * this file: `npm run db:generate` sees all of them and writes ONE migration history in `./drizzle`.
 *
 * Shopify SESSIONS are not here: they are in KV (`adapters/session-storage.ts`).
 */

/** The install record every Shopify app needs; the tenant key (`shop`, the myshopify.com domain) of every query. */
export const shops = sqliteTable(
  "shops",
  {
    shop: text("shop").primaryKey(),
    /** Shopify's stable shop GID, once an authoritative source gave it (the Partner API is asked by it). */
    shopifyShopId: text("shopify_shop_id"),
    name: text("name"),
    email: text("email"),
    contactEmail: text("contact_email"),
    logoUrl: text("logo_url"),
    url: text("url"),
    /** The shop's IANA zone from Shopify; every date the app renders uses it. */
    timeZone: text("time_zone"),
    relationshipStatus: text("relationship_status", { enum: ["INSTALLED", "UNINSTALLED", "REACTIVATED"] }),
    /** Ordering key of the lifecycle fact applied last (Shopify's trigger time), so a late webhook cannot undo a newer one. */
    relationshipOccurredAt: integer("relationship_occurred_at"),
    installedAt: integer("installed_at").notNull(),
    currentInstalledAt: integer("current_installed_at"),
    uninstalledAt: integer("uninstalled_at"),
    lastAuthenticatedAt: integer("last_authenticated_at"),
    /** A development / partner test store (excluded from real MRR). */
    isDevStore: integer("is_dev_store", { mode: "boolean" }).notNull().default(false),
    devStatusCheckedAt: integer("dev_status_checked_at"),
    /** Set by `AdminApi.shops().blockAccount`: the portal asked and the app agreed. The shop sees a page that says so. */
    blockedAt: integer("blocked_at"),
    blockedReason: text("blocked_reason"),
  },
  (table) => [
    index("shops_relationship_status_idx").on(table.relationshipStatus),
    index("shops_installed_at_idx").on(table.installedAt),
  ],
);

/** The current Managed Pricing state, one row per shop (the `SubscriptionStore` of `@firesio/plans/billing`). */
export const shopSubscriptions = sqliteTable("shop_subscriptions", {
  shop: text("shop").primaryKey(),
  status: text("status", { enum: ["NONE", "PENDING", "ACTIVE", "CANCELLATION_SCHEDULED", "FROZEN", "CANCELED", "UNKNOWN"] }).notNull(),
  planHandle: text("plan_handle"),
  trialEndsAt: integer("trial_ends_at"),
  currentPeriodEndsAt: integer("current_period_ends_at"),
  cancellationEffectiveAt: integer("cancellation_effective_at"),
  appliedOccurredAt: integer("applied_occurred_at").notNull(),
  appliedExternalId: text("applied_external_id").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Plans given by staff (`AdminApi.billing().grantPlan`) (the `PlanGrantStore`). */
export const shopPlanGrants = sqliteTable(
  "shop_plan_grants",
  {
    id: text("id").primaryKey(),
    shop: text("shop").notNull(),
    planHandle: text("plan_handle").notNull(),
    reason: text("reason").notNull(),
    grantedBy: text("granted_by").notNull(),
    startsAt: integer("starts_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
    revokedBy: text("revoked_by"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("shop_plan_grants_lookup_idx").on(table.shop, table.expiresAt, table.revokedAt)],
);

/** The store's notification choices, one row per (shop, type, channel): absence is the type's default (the `PreferenceStore` of `@firesio/notify`). */
export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    scope: text("scope").notNull(),
    event: text("event").notNull(),
    channel: text("channel").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.event, table.channel] })],
);
