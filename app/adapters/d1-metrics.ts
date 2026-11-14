import type { MetricsPort } from "~/core/shops/ports";

const DAY_MS = 86_400_000;

/** `2026-11-14` as the half-open UTC window [start, end) in epoch ms. */
function windowOf(day: string): { start: number; end: number } {
  const start = Date.parse(`${day}T00:00:00Z`);
  return { start, end: start + DAY_MS };
}

async function count(db: D1Database, sql: string, ...values: number[]): Promise<number> {
  const row = await db.prepare(sql).bind(...values).first();
  const value = row?.["n"];
  return typeof value === "number" ? value : 0;
}

/** Aggregates only: nothing here selects a person or a shop domain. */
export function d1Metrics(db: D1Database): MetricsPort {
  return {
    installedOn(day) {
      const { start, end } = windowOf(day);
      return count(db, `SELECT COUNT(*) AS n FROM shops WHERE is_dev_store = 0 AND installed_at >= ?1 AND installed_at < ?2`, start, end);
    },
    uninstalledOn(day) {
      const { start, end } = windowOf(day);
      return count(db, `SELECT COUNT(*) AS n FROM shops WHERE is_dev_store = 0 AND uninstalled_at >= ?1 AND uninstalled_at < ?2`, start, end);
    },
    activeShops() {
      return count(db, `SELECT COUNT(*) AS n FROM shops WHERE is_dev_store = 0 AND relationship_status IN ('INSTALLED', 'REACTIVATED')`);
    },
    async payingShopsByPlan() {
      const rows = await db
        .prepare(
          `SELECT s.plan_handle AS plan, COUNT(*) AS n FROM shop_subscriptions s JOIN shops h ON h.shop = s.shop
WHERE s.status IN ('ACTIVE', 'CANCELLATION_SCHEDULED') AND h.is_dev_store = 0 AND h.relationship_status IN ('INSTALLED', 'REACTIVATED') AND s.plan_handle IS NOT NULL
GROUP BY s.plan_handle`,
        )
        .all();
      const byPlan: Record<string, number> = {};
      for (const row of rows.results) {
        const plan = row["plan"];
        const n = row["n"];
        if (typeof plan === "string" && typeof n === "number") byPlan[plan] = n;
      }
      return byPlan;
    },
    ticketsCreatedOn(day) {
      const { start, end } = windowOf(day);
      return count(db, `SELECT COUNT(*) AS n FROM support_tickets WHERE created_at >= ?1 AND created_at < ?2`, start, end);
    },
    openTickets() {
      return count(db, `SELECT COUNT(*) AS n FROM support_tickets WHERE closed_at IS NULL`);
    },
  };
}

/** Open tickets of ONE shop, for the plan meter and the ticket entitlement. */
export function d1OpenTicketCount(db: D1Database) {
  return async (shop: string): Promise<number> => {
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM support_tickets WHERE shop = ?1 AND closed_at IS NULL`).bind(shop).first();
    const value = row?.["n"];
    return typeof value === "number" ? value : 0;
  };
}
