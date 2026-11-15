import { createRequestHandler, RouterContextProvider } from "react-router";
import { firesio } from "../app/firesio.server";

/**
 * The Worker's entry: React Router for requests, and the preset's handlers for everything else. With `future.v8_middleware` a
 * loader's `context` is a RouterContextProvider; the /app layout's middleware fills it, and server code reads `env` from
 * `cloudflare:workers`.
 */
const requestHandler = createRequestHandler(() => import("virtual:react-router/server-build"), import.meta.env.MODE);

export default {
  fetch(request) {
    return requestHandler(request, new RouterContextProvider());
  },

  /** Cron: drain the portal outbox every tick; the daily snapshot and prune on the daily one. */
  scheduled: (controller, env) => firesio.scheduled(controller, env),

  /** The verified Shopify webhooks, in both environments; a batch for any other queue is retried, never acknowledged. */
  queue: (batch, env) => firesio.queue(batch, env),

  /** Email Routing delivers mail sent to the app's support addresses. */
  email: (message, env) => firesio.email(message, env),
} satisfies ExportedHandler<Env>;

/** The commands the portal sends, over a service binding (the portal binds this entrypoint by name: `entrypoint: "AdminApi"`). */
export const AdminApi = firesio.AdminApi;
