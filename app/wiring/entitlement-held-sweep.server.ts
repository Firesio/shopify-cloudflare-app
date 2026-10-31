import { EntitlementRepo } from "~/models/entitlements.server";
import { HeldSweepRepo } from "~/models/entitlement-held-sweep.server";
import { sweepHeldEntitlements, type HeldSweepDeps } from "~/services/entitlement-held-sweep";
import { appRuntime } from "~/wiring/runtime.server";

/**
 * The cron's held-usage sweep (`ScheduledDependencies.entitlementReconcile`). By default it releases what has been held
 * for `HELD_MAX_AGE_MS`; an app that can tell a finished operation from a crashed one passes its own `decide` (and
 * `maxAgeMs`) where `scheduledDependencies` builds it.
 */
export function entitlementHeldSweep(
  policy: Pick<HeldSweepDeps, "decide" | "maxAgeMs" | "limit"> = {},
): { run(now: number): Promise<Record<string, number>> } {
  const held = new HeldSweepRepo();
  const entitlements = new EntitlementRepo(appRuntime().clock);
  return {
    run: async (now) => ({
      ...(await sweepHeldEntitlements({
        ...policy,
        listExpired: (createdAtOrBefore, limit) => held.listExpired(createdAtOrBefore, limit),
        apply: (shop, item, decision, actualAmount) => entitlements.applyReconciliation(shop, item, decision, actualAmount),
      }, now)),
    }),
  };
}
