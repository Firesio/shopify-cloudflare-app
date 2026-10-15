/**
 * A browser's web-push surface, faked at its boundary: `navigator.serviceWorker`, `PushManager`,
 * `Notification` and the few environment reads (secure context, user agent, display mode). The
 * code under test runs for real against it; the fake only records what was asked of the browser.
 * Nothing here talks to a network, and `PushSubscription.endpoint` is a reserved `.invalid` host.
 */
export interface PushBrowserOptions {
  /** `Notification.permission` before anything is asked. */
  readonly permission?: NotificationPermission;
  /** What the permission prompt resolves to when the person answers. */
  readonly promptAnswer?: NotificationPermission;
  /** A subscription the browser already holds. */
  readonly existing?: { readonly endpoint: string; readonly key?: Uint8Array } | null;
  readonly userAgent?: string;
  readonly standalone?: boolean;
  readonly maxTouchPoints?: number;
  readonly secureContext?: boolean;
  readonly serviceWorker?: boolean;
  readonly pushManager?: boolean;
  /** `serviceWorker.register` rejects, as it does when the worker script cannot be fetched. */
  readonly registerFails?: boolean;
  /** `pushManager.subscribe` rejects, as it does when the push service is unreachable. */
  readonly subscribeFails?: boolean;
  /** `pushManager.subscribe` never settles, as in a Chromium with no Google services or Brave with push off. */
  readonly subscribeHangs?: boolean;
}

export interface PushBrowser {
  /** Options each `subscribe` call received. */
  readonly subscribeCalls: { userVisibleOnly?: boolean; applicationServerKey?: BufferSource | string | null }[];
  readonly registrations: { readonly url: string; readonly scope: string | undefined }[];
  /** How many subscriptions were unsubscribed. */
  readonly unsubscribed: () => number;
  /** How many times the permission prompt was shown. */
  readonly prompts: () => number;
  /** The endpoint of the subscription the browser currently holds, or null. */
  readonly currentEndpoint: () => string | null;
  /** The worker posting a message to the page, as it does when a push arrives. */
  readonly deliver: (message: unknown) => void;
  readonly restore: () => void;
}

export const NEW_ENDPOINT = "https://push.fake-service.invalid/send/new-subscription";

const DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
export const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

interface HeldSubscription {
  readonly endpoint: string;
  readonly key: Uint8Array | undefined;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.length);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export function installPushBrowser(options: PushBrowserOptions = {}): PushBrowser {
  let permission: NotificationPermission = options.permission ?? "default";
  let held: HeldSubscription | null = options.existing
    ? { endpoint: options.existing.endpoint, key: options.existing.key }
    : null;
  let unsubscribed = 0;
  let prompts = 0;
  const subscribeCalls: PushBrowser["subscribeCalls"] = [];
  const registrations: { url: string; scope: string | undefined }[] = [];

  const wrap = (subscription: HeldSubscription) => ({
    endpoint: subscription.endpoint,
    options: { applicationServerKey: subscription.key ? toArrayBuffer(subscription.key) : null, userVisibleOnly: true },
    toJSON: () => ({ endpoint: subscription.endpoint, expirationTime: null, keys: { p256dh: "fake-p256dh", auth: "fake-auth" } }),
    unsubscribe: () => {
      held = null;
      unsubscribed += 1;
      return Promise.resolve(true);
    },
  });

  const registration = {
    pushManager: {
      getSubscription: () => Promise.resolve(held === null ? null : wrap(held)),
      subscribe: (call: { userVisibleOnly?: boolean; applicationServerKey?: BufferSource | string | null }) => {
        subscribeCalls.push(call);
        if (options.subscribeHangs) return new Promise<never>(() => undefined);
        if (options.subscribeFails) return Promise.reject(new DOMException("Registration failed - push service error", "AbortError"));
        const key = call.applicationServerKey instanceof Uint8Array ? call.applicationServerKey : undefined;
        held = { endpoint: NEW_ENDPOINT, key };
        return Promise.resolve(wrap(held));
      },
    },
  };

  class FakeNotification {
    static get permission() {
      return permission;
    }
    static requestPermission() {
      prompts += 1;
      if (permission === "default") permission = options.promptAnswer ?? "granted";
      return Promise.resolve(permission);
    }
  }

  const messageListeners = new Set<(event: MessageEvent) => void>();

  const serviceWorker = {
    register: (url: string, registerOptions?: { scope?: string }) => {
      registrations.push({ url, scope: registerOptions?.scope });
      if (options.registerFails) return Promise.reject(new TypeError("Failed to register a ServiceWorker: bad HTTP response code (404)"));
      return Promise.resolve(registration);
    },
    ready: Promise.resolve(registration),
    addEventListener: (type: string, listener: (event: MessageEvent) => void) => {
      if (type === "message") messageListeners.add(listener);
    },
    removeEventListener: (type: string, listener: (event: MessageEvent) => void) => {
      if (type === "message") messageListeners.delete(listener);
    },
  };

  // Each property is put back exactly as it was (or removed), so the DOM guard's own
  // stubs, such as the blocked `fetch`, are never disturbed.
  const restores: (() => void)[] = [];
  const override = (target: object, name: string, value: unknown) => {
    const original = Object.getOwnPropertyDescriptor(target, name);
    Object.defineProperty(target, name, { value, configurable: true, writable: true });
    restores.push(() => {
      if (original) Object.defineProperty(target, name, original);
      else Reflect.deleteProperty(target, name);
    });
  };

  override(globalThis, "Notification", FakeNotification);
  override(globalThis, "isSecureContext", options.secureContext ?? true);
  if (options.pushManager !== false) override(globalThis, "PushManager", class PushManager {});
  override(globalThis, "matchMedia", () => ({ matches: options.standalone ?? false, addEventListener() {}, removeEventListener() {} }));
  override(navigator, "userAgent", options.userAgent ?? DESKTOP_UA);
  override(navigator, "maxTouchPoints", options.maxTouchPoints ?? 0);
  if (options.serviceWorker !== false) override(navigator, "serviceWorker", serviceWorker);

  return {
    subscribeCalls,
    registrations,
    unsubscribed: () => unsubscribed,
    prompts: () => prompts,
    currentEndpoint: () => held?.endpoint ?? null,
    deliver: (message) => {
      for (const listener of messageListeners) listener(new MessageEvent("message", { data: message }));
    },
    restore: () => {
      for (const restore of restores.reverse()) restore();
    },
  };
}
