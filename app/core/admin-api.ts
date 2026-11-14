import type { BillingCommands, ShopsCommands, Standing } from "@firesio/portal-contract";
import type { PlanGrantStore } from "@firesio/plans/billing";
import { PLANS } from "./plans";
import type { ShopsPort } from "./shops/ports";

/**
 * The commands the portal sends (docs/architecture.md section 4): the app validates (the contract's schemas already did),
 * decides, and has the LAST WORD. Every command is idempotent. `account.kind` must be a shop: this app has no tenants.
 */
export interface AdminApiDeps {
  readonly shops: ShopsPort;
  readonly grants: PlanGrantStore;
  readonly now: () => number;
}

const unknownShop = { ok: false, reason: "unknown account" } as const;

async function standingOf(shops: ShopsPort, shop: string): Promise<Standing | null> {
  const record = await shops.get(shop);
  if (record === null) return null;
  return record.blockedAt === null
    ? { state: "active" }
    : { state: "blocked", reason: record.blockedReason ?? "blocked", blockedAt: new Date(record.blockedAt).toISOString() };
}

export function shopsHandlers(deps: AdminApiDeps): ShopsCommands {
  return {
    async getStanding({ account }) {
      const standing = account.kind === "shopify_shop" ? await standingOf(deps.shops, account.id) : null;
      return standing === null ? unknownShop : { ok: true, value: standing };
    },
    async blockAccount({ account, reason, actor }) {
      if (account.kind !== "shopify_shop" || (await deps.shops.get(account.id)) === null) return unknownShop;
      await deps.shops.block(account.id, `${reason} (by ${actor})`, deps.now());
      const standing = await standingOf(deps.shops, account.id);
      return standing === null ? unknownShop : { ok: true, value: standing };
    },
  };
}

const planEntries = Object.entries(PLANS);

export function billingHandlers(deps: AdminApiDeps): BillingCommands {
  return {
    async plans() {
      return {
        ok: true,
        value: { plans: planEntries.map(([id, plan]) => ({ id, name: plan.name, ...(plan.monthly.amount > 0 ? { price: plan.monthly, interval: "every_30_days" as const } : {}) })) },
      };
    },
    async grantPlan({ account, planId, until, reason, actor }) {
      if (account.kind !== "shopify_shop" || (await deps.shops.get(account.id)) === null) return unknownShop;
      if (!planEntries.some(([id]) => id === planId)) return { ok: false, reason: "unknown plan" };
      const startsAt = deps.now();
      const expiresAt = until === undefined ? Number.MAX_SAFE_INTEGER : Date.parse(until);
      if (expiresAt <= startsAt) return { ok: false, reason: "the end of the gift is in the past" };
      await deps.grants.create(account.id, { planHandle: planId, reason, grantedBy: actor, startsAt, expiresAt, revokedAt: null });
      return { ok: true, value: { planId, ...(until === undefined ? {} : { until }) } };
    },
  };
}
