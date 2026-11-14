import { createContext, createRequestHandler, RouterContextProvider } from "react-router";
import { runScheduled } from "../app/core/scheduled";
import { consumeWebhooks } from "../app/core/webhooks/consume";
import { createServices } from "../app/wiring/services";
import { consumeDeps, scheduledDeps } from "../app/wiring/scheduled";
import { handleInboundEmail } from "./inbound-email";

export { AdminApi } from "./admin-api";

/**
 * With `future.v8_middleware` a loader's `context` is a RouterContextProvider. The route modules of `@firesio/app-ui` read
 * their deps from it (set by the /app layout's middleware); server code reads `env` from `cloudflare:workers`.
 */
export const cloudflareContext = createContext<{ env: Env; ctx: ExecutionContext }>();

const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

/** The queues this Worker consumes: the verified Shopify webhooks, in both environments. */
const WEBHOOK_QUEUES: readonly string[] = ["shopify-webhooks", "shopify-webhooks-prod"];

export default {
  fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    context.set(cloudflareContext, { env, ctx });
    return requestHandler(request, context);
  },

  /** Cron: drain the portal outbox every tick; the daily snapshot and prune on the daily one (`core/cron.ts`). */
  async scheduled(controller, env) {
    await runScheduled(scheduledDeps(createServices(env)), controller.cron);
  },

  /** Email Routing delivers mail sent to the app's support addresses. */
  async email(message, env) {
    const s = createServices(env);
    await handleInboundEmail(message, { parse: s.parseMail, receive: (mail) => s.inbox.receive(mail), log: (entry) => s.log(entry) });
  },

  async queue(batch, env) {
    if (!WEBHOOK_QUEUES.includes(batch.queue)) {
      // Real work addressed to a consumer we do not have: acking would delete it silently, retrying keeps it until the DLQ takes it.
      console.error(JSON.stringify({ event: "queue.unknown", queue: batch.queue, messages: batch.messages.length }));
      batch.retryAll({ delaySeconds: 60 });
      return;
    }
    await consumeWebhooks(consumeDeps(createServices(env)), batch);
  },
} satisfies ExportedHandler<Env>;
