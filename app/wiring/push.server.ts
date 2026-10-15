import { WebPushSender } from "~/adapters/web-push-sender.server";
import { vapidConfig, type VapidConfig } from "~/lib/vapid-config";
import { PushSubscriptionRepo } from "~/models/push-subscriptions.server";
import type { PushSender } from "~/ports/push-sender";
import type { PushTransport } from "~/ports/push-transport";
import { getEnv } from "~/request-context.server";
import { appRuntime } from "~/wiring/runtime.server";

/**
 * The private VAPID key is a secret that `wrangler.jsonc` deliberately does not declare (a missing required secret fails
 * the deploy, and push is optional), so `Env` has no type for it. It is read as `unknown` and narrowed by `vapidConfig`.
 * Same precedent as `SHOPIFY_API_SECRET_PREVIOUS` (`webhookSecrets`).
 */
function configuration(env: Env & { readonly VAPID_PRIVATE_KEY?: unknown }): VapidConfig | null {
  // The app's https URL is a valid VAPID subject (RFC 8292 section 2.1), so no contact address needs configuring.
  return vapidConfig(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.SHOPIFY_APP_URL);
}

/** The Web Push sender, or `undefined` when VAPID keys are not (validly) configured: push is optional. Built per call. */
export function pushSender(): PushSender | undefined {
  const config = configuration(getEnv());
  if (config === null) return undefined;
  const runtime = appRuntime();
  return new WebPushSender({
    vapid: config,
    fetch,
    now: runtime.clock.now,
    randomBytes: runtime.randomBytes,
    log: (entry) => console.error(JSON.stringify(entry)),
  });
}

/** Whether push can send, and the public key a browser needs to subscribe (empty when it cannot). */
export function pushConfig(): { readonly configured: boolean; readonly publicKey: string } {
  const config = configuration(getEnv());
  return { configured: config !== null, publicKey: config?.publicKey ?? "" };
}

/**
 * What the notification system's push channel sends with: the sender, the staff device store, a clock and a log. `undefined`
 * exactly when `pushSender()` is, which is also what makes `push` an unavailable channel rather than a failing one.
 */
export function pushTransport(): PushTransport | undefined {
  const sender = pushSender();
  if (sender === undefined) return undefined;
  return {
    sender,
    devices: new PushSubscriptionRepo(),
    now: appRuntime().clock.now,
    log: (entry) => console.error(JSON.stringify(entry)),
  };
}
