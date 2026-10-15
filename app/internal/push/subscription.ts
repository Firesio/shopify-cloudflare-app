import { err, ok, type Result } from "~/lib/result";
import { hashEndpoint, sameApplicationServerKey, urlBase64ToUint8Array } from "./encoding";

/**
 * The browser half of registering a device: service worker, permission, push
 * subscription. No React; each step returns a `Result` so the hook decides what
 * the person sees. These are the only functions that touch `navigator.serviceWorker`,
 * `PushManager` and `Notification`.
 */
export const SERVICE_WORKER_URL = "/internal-sw.js";
export const SERVICE_WORKER_SCOPE = "/internal/";

export type PushError =
  | "permission-denied"
  | "permission-dismissed"
  | "registration-failed"
  | "key-invalid"
  | "subscribe-failed"
  | "push-service-timeout";

/**
 * How long to wait for the browser's push service to answer a subscribe. Some
 * browsers never answer at all (a Chromium without Google services, Brave with
 * push messaging off): the promise stays pending forever, so without a bound the
 * person watches a spinner that never ends.
 */
export const SUBSCRIBE_TIMEOUT_MS = 20_000;

class SubscribeTimeout extends Error {}

function withTimeout<T>(pending: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SubscribeTimeout("push service did not answer")), milliseconds);
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function logFailure(step: string, error: unknown): void {
  console.warn(JSON.stringify({ event: "push.browser_failed", step, message: error instanceof Error ? error.message : String(error) }));
}

/** Registers (idempotently) and waits for the worker that will show notifications. */
export async function registerWorker(): Promise<Result<ServiceWorkerRegistration, "registration-failed">> {
  try {
    await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE });
    return ok(await navigator.serviceWorker.ready);
  } catch (error) {
    logFailure("register", error);
    return err("registration-failed");
  }
}

/** The endpoint hash of the browser's current subscription, or null when it has none. */
export async function currentEndpointHash(registration: ServiceWorkerRegistration): Promise<Result<string | null, "subscribe-failed">> {
  try {
    const subscription = await registration.pushManager.getSubscription();
    return ok(subscription === null ? null : await hashEndpoint(subscription.endpoint));
  } catch (error) {
    logFailure("read", error);
    return err("subscribe-failed");
  }
}

/**
 * Asks for permission. MUST be the first thing a click handler does: browsers (iOS
 * especially) only show the prompt while the user gesture is still alive.
 */
export async function askPermission(): Promise<Result<"granted", "permission-denied" | "permission-dismissed">> {
  const permission = await Notification.requestPermission();
  if (permission === "granted") return ok("granted");
  return err(permission === "denied" ? "permission-denied" : "permission-dismissed");
}

/**
 * The subscription for `publicKey`: the existing one when it was made with this key,
 * otherwise a new one (a subscription made with another key is dropped first, because
 * `subscribe` refuses to replace it).
 */
export async function subscribeWithKey(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<Result<PushSubscription, "key-invalid" | "subscribe-failed" | "push-service-timeout">> {
  const key = urlBase64ToUint8Array(publicKey);
  if (key === null || key.length === 0) return err("key-invalid");
  try {
    const existing = await registration.pushManager.getSubscription();
    if (existing !== null) {
      if (sameApplicationServerKey(existing.options.applicationServerKey, key)) return ok(existing);
      await existing.unsubscribe();
    }
    return ok(
      await withTimeout(
        registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }),
        SUBSCRIBE_TIMEOUT_MS,
      ),
    );
  } catch (error) {
    logFailure("subscribe", error);
    return err(error instanceof SubscribeTimeout ? "push-service-timeout" : "subscribe-failed");
  }
}

/** Drops the browser's subscription. True when there was none or it is gone. */
export async function dropSubscription(registration: ServiceWorkerRegistration): Promise<boolean> {
  try {
    const subscription = await registration.pushManager.getSubscription();
    return subscription === null ? true : await subscription.unsubscribe();
  } catch (error) {
    logFailure("unsubscribe", error);
    return false;
  }
}

/** The browser-side half of the three things a person can do here, each one `Result`, each in the order the browser needs. */
export interface EnabledBrowser {
  /** `PushSubscription.toJSON()` as the `subscribe` intent's `subscription` field. */
  readonly subscriptionJson: string;
  readonly endpointHash: string;
}

/** What this browser holds now (registering the worker first), as an endpoint hash or null. */
export async function readBrowser(): Promise<Result<string | null, PushError>> {
  const registered = await registerWorker();
  return registered.ok ? currentEndpointHash(registered.value) : registered;
}

/** Permission, worker, subscription. The permission prompt must be reached before any other await. */
export async function enableBrowser(publicKey: string): Promise<Result<EnabledBrowser, PushError>> {
  const permission = await askPermission();
  if (!permission.ok) return permission;
  const registered = await registerWorker();
  if (!registered.ok) return registered;
  const subscription = await subscribeWithKey(registered.value, publicKey);
  if (!subscription.ok) return subscription;
  return ok({
    subscriptionJson: JSON.stringify(subscription.value.toJSON()),
    endpointHash: await hashEndpoint(subscription.value.endpoint),
  });
}

/** Drops the browser's subscription; the server's row is removed separately. */
export async function disableBrowser(): Promise<Result<null, PushError>> {
  const registered = await registerWorker();
  if (!registered.ok) return registered;
  return (await dropSubscription(registered.value)) ? ok(null) : err("subscribe-failed");
}
