import { enqueueStatement } from "@firesio/portal-client/d1";
import type { PortalMessage } from "@firesio/portal-client";
import { prepared } from "./d1-batch";
import type { ShopIdentityFacts, ShopRecord, ShopsPort } from "~/core/shops/ports";

const SELECT = `SELECT shop, shopify_shop_id, name, email, time_zone, relationship_status, relationship_occurred_at, installed_at, blocked_at, blocked_reason FROM shops WHERE shop = ?1`;

/** Install, or revive an uninstalled shop (a renewal of the same token only stamps the authentication time). */
const UPSERT_INSTALL = `INSERT INTO shops (shop, installed_at, current_installed_at, relationship_status, relationship_occurred_at, last_authenticated_at)
VALUES (?1, ?2, ?2, 'INSTALLED', ?2, ?2)
ON CONFLICT (shop) DO UPDATE SET
  last_authenticated_at = ?2,
  current_installed_at = CASE WHEN shops.relationship_status = 'UNINSTALLED' THEN ?2 ELSE COALESCE(shops.current_installed_at, ?2) END,
  uninstalled_at = CASE WHEN shops.relationship_status = 'UNINSTALLED' THEN NULL ELSE shops.uninstalled_at END,
  relationship_occurred_at = CASE WHEN shops.relationship_status = 'UNINSTALLED' THEN ?2 ELSE COALESCE(shops.relationship_occurred_at, ?2) END,
  relationship_status = CASE WHEN shops.relationship_status = 'UNINSTALLED' THEN 'REACTIVATED' ELSE COALESCE(shops.relationship_status, 'INSTALLED') END`;

/** Applied only when no newer lifecycle fact is stored and the shop was not installed again after Shopify sent this one. */
const APPLY_UNINSTALL = `UPDATE shops SET relationship_status = 'UNINSTALLED', uninstalled_at = ?2, relationship_occurred_at = ?2
WHERE shop = ?1 AND relationship_status <> 'UNINSTALLED' AND COALESCE(relationship_occurred_at, 0) <= ?2 AND COALESCE(current_installed_at, 0) <= ?2`;

function text(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function int(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function statusOf(value: string | null): ShopRecord["relationshipStatus"] {
  return value === "INSTALLED" || value === "UNINSTALLED" || value === "REACTIVATED" ? value : null;
}

function recordOf(row: Record<string, unknown>): ShopRecord | null {
  const shop = text(row, "shop");
  const installedAt = int(row, "installed_at");
  if (shop === null || installedAt === null) return null;
  return {
    shop,
    shopifyShopId: text(row, "shopify_shop_id"),
    name: text(row, "name"),
    email: text(row, "email"),
    timeZone: text(row, "time_zone"),
    relationshipStatus: statusOf(text(row, "relationship_status")),
    relationshipOccurredAt: int(row, "relationship_occurred_at"),
    installedAt,
    blockedAt: int(row, "blocked_at"),
    blockedReason: text(row, "blocked_reason"),
  };
}

/** The `shops` table. Every statement is keyed by `shop`, bound, never interpolated. */
export function d1Shops(db: D1Database): ShopsPort {
  const withEvent = (statement: D1PreparedStatement, event: PortalMessage | null, at: number): D1PreparedStatement[] =>
    prepared(event === null ? [statement] : [statement, enqueueStatement(db, event, new Date(at))]);
  return {
    async get(shop) {
      const row = await db.prepare(SELECT).bind(shop).first();
      return row === null ? null : recordOf(row);
    },
    async recordInstall({ shop, at, event }) {
      await db.batch(withEvent(db.prepare(UPSERT_INSTALL).bind(shop, at), event, at));
    },
    async recordUninstall({ shop, occurredAt, event }) {
      const row = await db.prepare(SELECT).bind(shop).first();
      const current = row === null ? null : recordOf(row);
      if (current === null) return "unknown_shop";
      const stale = current.relationshipStatus === "UNINSTALLED" || (current.relationshipOccurredAt ?? 0) > occurredAt;
      if (stale) return "stale";
      await db.batch(withEvent(db.prepare(APPLY_UNINSTALL).bind(shop, occurredAt), event, occurredAt));
      return "applied";
    },
    async saveIdentity(shop: string, facts: ShopIdentityFacts) {
      await db
        .prepare(`UPDATE shops SET shopify_shop_id = ?2, name = ?3, email = ?4, contact_email = ?5, url = ?6 WHERE shop = ?1`)
        .bind(shop, facts.shopifyShopId, facts.name, facts.email, facts.contactEmail, facts.url)
        .run();
    },
    async saveTimeZone(shop, timeZone) {
      await db.prepare(`UPDATE shops SET time_zone = ?2 WHERE shop = ?1`).bind(shop, timeZone).run();
    },
    async saveDevStatus(shop, isDevStore, at) {
      await db.prepare(`UPDATE shops SET is_dev_store = ?2, dev_status_checked_at = ?3 WHERE shop = ?1`).bind(shop, isDevStore ? 1 : 0, at).run();
    },
    async block(shop, reason, at) {
      await db.prepare(`UPDATE shops SET blocked_at = COALESCE(blocked_at, ?3), blocked_reason = COALESCE(blocked_reason, ?2) WHERE shop = ?1`).bind(shop, reason, at).run();
    },
  };
}
