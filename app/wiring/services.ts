import { env as workerEnv, waitUntil } from "cloudflare:workers";
import { d1Metrics, d1OpenTicketCount } from "~/adapters/d1-metrics";
import { d1Shops } from "~/adapters/d1-shops";
import { parseInboundMail } from "~/adapters/inbound-mail";
import { shopifyFacts } from "~/adapters/shopify-facts";
import { refreshSubscription } from "~/core/billing/refresh";
import { apiVersion } from "~/core/api-version";
import type { PlanHandle } from "~/core/plans";
import type { AfterAuthDeps } from "~/core/shops/after-auth";
import type { LifecycleDeps } from "~/core/shops/lifecycle";
import { createAi } from "./ai";
import { billingServices } from "./billing";
import { blocklistFor } from "./blocklist";
import { memberServices } from "./members";
import { createNotifierFor } from "./notifications";
import { portalEmitter } from "./portal";
import { jsonLog, systemRuntime, type Runtime } from "./runtime";
import { supportNotifier, supportServices } from "./support";
import { inbox, redactionGuard, webhookRouter } from "./webhooks";

/** The shop's plan, the portal's emitter and the tables behind them: what almost every other service needs. */
function foundations(env: Env, runtime: Runtime) {
  const portal = portalEmitter(env, runtime);
  const shops = d1Shops(env.DB);
  const lifecycle: LifecycleDeps = { shops, portal, log: jsonLog };
  const { billing, usage, grants } = billingServices(env, runtime);
  const effectivePlanHandle = async (shop: string): Promise<PlanHandle> => {
    const plan = await billing.effectivePlan(shop);
    return plan.ok ? plan.effective.planHandle : "free";
  };
  const refresh = (shop: { readonly domain: string; readonly shopifyShopId: string | null }) => refreshSubscription({ billing, portal, now: runtime.now, log: jsonLog }, shop);
  return { portal, shops, lifecycle, billing, usage, grants, refresh, ...memberServices(env, effectivePlanHandle) };
}

function afterAuthDepsOf(env: Env, runtime: Runtime, base: ReturnType<typeof foundations>): AfterAuthDeps {
  return {
    ...base.lifecycle,
    facts: shopifyFacts({ apiVersion, fetch: (url, init) => fetch(url, init), sleep: runtime.sleep }),
    now: runtime.now,
    clearRedaction: (shop) => redactionGuard(env.DB).clearOnInstall(shop),
    refreshSubscription: base.refresh,
    afterResponse: (task) => waitUntil(task),
  };
}

/**
 * THE COMPOSITION ROOT: the one place that picks D1 adapters, reads the clock and mints ids (lint bans `new Date()`,
 * `Date.now` and `crypto.randomUUID` elsewhere). Entry points (routes, the Worker's handlers, the AdminApi) get everything
 * from `services()` and see ports and use cases only. Nothing here is per request or per shop, so building it twice is harmless.
 */
export function createServices(env: Env) {
  const runtime = systemRuntime();
  const base = foundations(env, runtime);
  const notifier = createNotifierFor(env, runtime);
  const blocklist = blocklistFor(env);
  const ai = createAi(env, runtime);
  const supportDeps = supportServices(env, runtime, { notifier: supportNotifier(env, notifier, blocklist), ai });
  const webhooks = webhookRouter({ env, runtime, portal: base.portal, lifecycle: base.lifecycle, support: supportDeps.support, log: jsonLog });
  return {
    env,
    runtime,
    ...base,
    afterAuthDeps: afterAuthDepsOf(env, runtime, base),
    metrics: d1Metrics(env.DB),
    openTicketCount: d1OpenTicketCount(env.DB),
    notifier,
    blocklist,
    ai,
    ...supportDeps,
    parseMail: parseInboundMail,
    webhooks,
    webhookInbox: inbox(env.DB),
    redaction: redactionGuard(env.DB),
    log: jsonLog,
  };
}

export type Services = ReturnType<typeof createServices>;

/** The services for the current request (or cron tick, or queue batch): `env` comes from `cloudflare:workers`, never from `ctx`. */
export function services(): Services {
  return createServices(workerEnv);
}
