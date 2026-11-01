import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { MEMBER_ROLES } from "~/domain/member-access";
import { MEMBER_STATUSES } from "~/domain/member-lifecycle";

/**
 * The people of one shop who use the app: Shopify staff users linked to the shop, each with a role.
 *
 * Shop-scoped like every merchant table (`shop` first in every query). The person's identity is Shopify's:
 * `shopify_user_id` is the id in Shopify's ID token, so there is no password and no sign-up here.
 *
 * `shopify_user_id` is NULL on an invitation, which names an email and no one yet; it is filled when the invited person
 * opens the app. SQLite lets many rows hold NULL under a unique index, so the one-membership-per-user rule below holds
 * for linked members and leaves invitations alone.
 *
 * Holds a name and an email of the merchant's staff, so it goes with the rest of a shop's rows on `shop/redact`.
 */
export const shopMembers = sqliteTable(
  "shop_members",
  {
    id: text("id").primaryKey(),
    shop: text("shop").notNull(),
    /** Shopify's user id (the ID token's `sub`) as text; null while this row is only an invitation. */
    shopifyUserId: text("shopify_user_id"),
    /** Lower-cased. Only ever a VERIFIED address from Shopify, or the one an invitation was written for. */
    email: text("email"),
    name: text("name"),
    /** One of MEMBER_ROLES. Plain TEXT, so a new role needs no migration; a role the code no longer knows holds no permission. */
    role: text("role", { enum: MEMBER_ROLES }).notNull(),
    status: text("status", { enum: MEMBER_STATUSES }).notNull(),
    /** Shopify said this user owns the store the last time they opened the app. */
    accountOwner: integer("account_owner", { mode: "boolean" }).notNull().default(false),
    /** Shopify said this user is a collaborator (an agency or freelancer), not a staff member of the store. */
    collaborator: integer("collaborator", { mode: "boolean" }).notNull().default(false),
    /** The member who sent the invitation, when this row began as one. */
    invitedBy: text("invited_by"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    /** Throttled (see the service), so a page view is not a write. */
    lastSeenAt: integer("last_seen_at"),
  },
  (table) => [
    uniqueIndex("shop_members_user_idx").on(table.shop, table.shopifyUserId),
    // Matching an invitation to the person who opened the app, and listing a shop's team.
    index("shop_members_email_idx").on(table.shop, table.email),
    index("shop_members_status_idx").on(table.shop, table.status),
  ],
);

export type ShopMemberRow = typeof shopMembers.$inferSelect;
