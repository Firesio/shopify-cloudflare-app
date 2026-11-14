import { createEmitter, outboxSink, type Emitter } from "@firesio/portal-client";
import { d1OutboxStore } from "@firesio/portal-client/d1";
import { identity } from "~/core/identity";
import type { Runtime } from "./runtime";

/**
 * The events for the portal (docs/architecture.md section 4): every one goes into the D1 outbox, and the cron's `drain`
 * sends it to the `PORTAL_EVENTS` Queue. A portal problem never fails a merchant's request: callers log a failed outcome.
 * `appSlug` is our own name (`core/identity.ts`), the one on the portal's `/apps` page.
 */
export function portalEmitter(env: Env, runtime: Runtime): Emitter {
  return createEmitter({
    appSlug: identity.slug,
    newId: runtime.uuid,
    now: runtime.date,
    sink: outboxSink(d1OutboxStore(env.DB), runtime.date),
  });
}

export function outboxStore(env: Env) {
  return d1OutboxStore(env.DB);
}
