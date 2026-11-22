import { createRequestHandler, RouterContextProvider } from "react-router";
import { withSecurityHeaders } from "@firesio/app/shell";
import { firesio } from "../app/firesio.server";

/**
 * The Worker's entry: React Router for requests, and the preset's handlers for everything else. With `future.v8_middleware` a
 * loader's `context` is a RouterContextProvider; the /app layout's middleware fills it, and server code reads `env` from
 * `cloudflare:workers`.
 */
const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

export default {
  /**
   * Every response, whatever produced it, leaves with the security headers (`withSecurityHeaders` of `@firesio/app/shell`: nosniff, referrer policy, HSTS and the strict CSP outside `/app`, `/auth`, `/webhooks`, `/healthz`). `firesio.fetch` opens the request's context
   * (`firesio.context`: the typed env, the database, work after the response), so code that runs outside the /app middleware (a public page, a
   * resource route) reads the same things.
   */
  fetch: firesio.fetch(async (request) => withSecurityHeaders(request, await requestHandler(request, new RouterContextProvider()))),

  /** Cron only TRIGGERS: it drains the portal outbox and puts each periodic job of its trigger on the jobs queue (`<slug>-jobs`); the work is the jobs'. */
  scheduled: (controller, env) => firesio.scheduled(controller, env),

  /** The verified Shopify webhooks, the job system and the notify deliveries, in both environments; a batch for any other queue is retried, never acknowledged. */
  queue: (batch, env) => firesio.queue(batch, env),

  /** Email Routing delivers mail sent to the app's addresses: the app's `inbound.email` routes first, then the support inbox. */
  email: (message, env) => firesio.email(message, env),
} satisfies ExportedHandler<Env>;

/** The commands the portal sends, over a service binding (the portal binds this entrypoint by name: `entrypoint: "AdminApi"`). */
export const AdminApi = firesio.AdminApi;

/**
 * The ONE Workflow class of the app's flows (binding `FLOWS`, `[[workflows]]` in wrangler.jsonc): the preset's own (uninstall, post-install, seats) run on it too,
 * so it is declared even while the app has no flow of its own. The class must be exported under this name from the Worker's entry.
 */
export class FiresioFlows extends firesio.FiresioFlows {}

/**
 * The per-shop Durable Object (binding `SHOP_COORDINATOR`, `migrations` in wrangler.jsonc): one token refresh at a time and a lease lock for a shop's writers. Its
 * class lives in the app's Worker, exported from the subpath (the package's root never imports it).
 */
export { ShopCoordinator } from "@firesio/app/preset/coordinator";
