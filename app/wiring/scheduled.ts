import { drain } from "@firesio/portal-client";
import { d1OutboxStore } from "@firesio/portal-client/d1";
import type { ConsumeDeps } from "~/core/webhooks/consume";
import { sendDailySnapshot } from "~/core/metrics-snapshot";
import type { ScheduledDeps } from "~/core/scheduled";
import type { Services } from "./services";

const DAY_MS = 86_400_000;
/** Sent outbox rows are kept a week for inspection, then pruned. */
const OUTBOX_RETENTION_MS = 7 * DAY_MS;

/** A prune that failed counts as nothing deleted: the next tick tries again, and the cron step logs the numbers. */
async function pruned(result: Promise<{ readonly ok: boolean; readonly deleted?: number }>): Promise<number> {
  const done = await result;
  return done.ok ? (done.deleted ?? 0) : 0;
}

export function scheduledDeps(s: Services): ScheduledDeps {
  const store = d1OutboxStore(s.env.DB);
  return {
    drainOutbox: () => drain({ queue: s.env.PORTAL_EVENTS, store, now: s.runtime.date }),
    sendSnapshot: () => sendDailySnapshot({ metrics: s.metrics, portal: s.portal, log: s.log }, s.runtime.now()),
    prune: async () => ({
      outbox: await store.pruneSent(s.runtime.now() - OUTBOX_RETENTION_MS),
      usage: await pruned(s.usage.prune(s.runtime.date())),
      uploads: await s.support.sweepExpiredUploads(),
    }),
    log: s.log,
  };
}

export function consumeDeps(s: Services): ConsumeDeps {
  return { process: { inbox: s.webhookInbox, redaction: s.redaction, router: s.webhooks, now: s.runtime.now }, log: s.log };
}
