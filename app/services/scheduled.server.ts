import type { SweepPlan } from "~/domain/cron-schedule";
import type { ScheduledDependencies } from "~/ports/scheduled";
import { pruneExpiredRecords } from "~/services/prune-expired-records";

/** Keep spent and expired tokens around briefly, so a replay still reports accurately. */
const TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Everything the cron does, in one place.
 *
 * Each sweep guards its own errors: one failing must never cost the others their
 * tick, and a cron that throws simply does not run the rest.
 */
export async function runScheduledSweeps(
  now: number,
  dependencies: ScheduledDependencies,
  plan: SweepPlan = { includeDailyMaintenance: true },
): Promise<void> {
  if (plan.includeDailyMaintenance) await runDailyMaintenance(now, dependencies);
  // A quota reservation or capacity slot a crashed run left `held` is only settled here (docs/entitlements.md). It is a
  // cheap D1 sweep, so it runs on every tick, the hourly probe-only one included: a stuck slot clears within about an
  // hour of crossing the age limit, not a day. Before the probe, whose network calls take the longest.
  await sweep("entitlement_reconcile", async () => ({ ...(await dependencies.entitlementReconcile.run(now)) }));
  // Shopify tells apps not to rely on webhooks alone; this is what finds an uninstall whose webhook was lost.
  // It runs on every tick, including the hourly probe-only one.
  await sweep("uninstall_reconciliation", async () => ({ ...(await dependencies.uninstallProbe.run(now)) }));
}

async function runDailyMaintenance(now: number, dependencies: ScheduledDependencies): Promise<void> {
  await sweep("password_reset_tokens", async () => {
    const deleted = await dependencies.tokens.deleteExpiredBefore(
      now - TOKEN_RETENTION_MS,
    );
    return { deleted };
  });
  await sweep("retention", async () => {
    const results = await pruneExpiredRecords(now, dependencies.retention);
    return {
      deleted: Object.fromEntries(results.map(({ target, outcome }) => [target, outcome.deleted])),
      backlog: results.filter(({ outcome }) => outcome.status === "backlog").map(({ target }) => target),
      failed: results.filter(({ outcome }) => outcome.status === "failed").map(({ target }) => target),
    };
  });
  await sweep("pending_uploads", async () => {
    const uploads = await dependencies.uploads.listExpiredUploads(now);
    if (uploads.length === 0) return { deleted: 0 };
    await dependencies.uploads.deleteUploadObjects(uploads.map((upload) => upload.r2Key));
    const deleted = await dependencies.uploads.deleteExpiredUploads(
      uploads.map((upload) => upload.id),
      now,
    );
    return { deleted };
  });
  await sweep("partner_history", async () => {
    const result = await dependencies.history.reconcile(now);
    if (result.status === "failed") throw new Error(`${result.code}: ${result.detail}`);
    return { pages: result.pages, events: result.events };
  });
}

async function sweep(
  name: string,
  run: () => Promise<Record<string, unknown>>,
): Promise<void> {
  try {
    const result = await run();
    console.log(JSON.stringify({ event: "cron.sweep", sweep: name, ...result }));
  } catch (error) {
    // Logged, not rethrown — see above.
    console.error(
      JSON.stringify({
        event: "cron.sweep_failed",
        sweep: name,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
