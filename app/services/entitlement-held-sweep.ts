// Ring 3 — the cron sweep that settles what a crashed run left `held` (docs/entitlements.md, "Crash reconciliation").
// A quota reservation or capacity allocation is held between `reserve`/`allocate` and the caller's `commit`/`release`/
// `confirm`; a crash in between leaves it held for good, which would eat the shop's quota or a capacity slot forever.
//
// Each tick settles up to one batch of the OLDEST items across all shops, using the same shop-scoped transitions a
// caller uses (`reconcileHeld` over `applyReconciliation`), so a replay or a race with a late caller changes nothing
// twice. By default an item held for `HELD_MAX_AGE_MS` is RELEASED: the work behind it did not finish, or the caller
// would have settled it. An app that can tell better (a document that was in fact created) passes its own `decide`.
// An item the decision ignores stays held and is listed again next tick; a policy that ignores more than a batch of
// the oldest items starves the newer ones, so ignore sparingly.
import { HELD_MAX_AGE_MS, HELD_SWEEP_BATCH, isHeldExpired } from "~/domain/entitlement-held";
import type { HeldDecision, HeldItem, HeldReconciliationPort } from "~/ports/entitlement-reconciliation";
import { reconcileHeld } from "./entitlement-reconciliation.server";

export interface HeldSweepDeps {
  /** Held items created at or before `createdAtOrBefore`, of every shop, oldest first, at most `limit`. */
  readonly listExpired: (createdAtOrBefore: number, limit: number) => Promise<readonly HeldItem[]>;
  readonly apply: HeldReconciliationPort["apply"];
  /** The app's policy per item; the default releases what is older than `maxAgeMs`. */
  readonly decide?: (item: HeldItem) => HeldDecision | Promise<HeldDecision>;
  readonly maxAgeMs?: number;
  readonly limit?: number;
}

export interface HeldSweepResult {
  readonly examined: number;
  readonly committed: number;
  readonly allocated: number;
  readonly released: number;
  /** Items a settlement refused, or that a thrown error stopped. */
  readonly failed: number;
  /** 1 when the batch came back full: more may be waiting for the next tick. */
  readonly backlog: 0 | 1;
}

function byShop(items: readonly HeldItem[]): ReadonlyMap<string, readonly HeldItem[]> {
  const groups = new Map<string, HeldItem[]>();
  for (const item of items) groups.set(item.shop, [...(groups.get(item.shop) ?? []), item]);
  return groups;
}

export async function sweepHeldEntitlements(deps: HeldSweepDeps, now: number): Promise<HeldSweepResult> {
  const maxAgeMs = deps.maxAgeMs ?? HELD_MAX_AGE_MS;
  const limit = deps.limit ?? HELD_SWEEP_BATCH;
  const decide = deps.decide ?? ((item: HeldItem): HeldDecision => (isHeldExpired(item.createdAt, now, maxAgeMs) ? "release" : "ignore"));
  const items = await deps.listExpired(now - maxAgeMs, limit);
  let committed = 0;
  let allocated = 0;
  let released = 0;
  let failed = 0;
  for (const [shop, shopItems] of byShop(items)) {
    // Sequential: each settlement is its own guarded transition (see `reconcileHeld`); the batch is the bound.
    try {
      const outcome = await reconcileHeld(shop, { listHeld: async () => ({ items: shopItems }), apply: deps.apply }, decide);
      committed += outcome.committed;
      allocated += outcome.allocated;
      released += outcome.released;
      failed += outcome.failures.length;
    } catch (error) {
      failed += shopItems.length;
      console.error(JSON.stringify({
        event: "entitlements.held_sweep_shop_failed",
        shop,
        items: shopItems.length,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
  return { examined: items.length, committed, allocated, released, failed, backlog: items.length >= limit ? 1 : 0 };
}
