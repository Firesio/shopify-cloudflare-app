/**
 * Whether THIS browser can receive web push, as a closed union. Pure: it is given
 * what the browser reports (`readPushEnvironment` in `./environment.ts` collects
 * it), so every branch is testable without a browser.
 */
export type NotificationPermissionState = "default" | "granted" | "denied";

export interface PushEnvironment {
  readonly secureContext: boolean;
  readonly hasServiceWorker: boolean;
  readonly hasPushManager: boolean;
  /** `Notification.permission`, or null when the browser has no Notification API. */
  readonly permission: NotificationPermissionState | null;
  readonly userAgent: string;
  /** iPadOS reports itself as a Mac; touch points are what gives it away. */
  readonly maxTouchPoints: number;
  /** Running as an installed web app (display-mode: standalone, or iOS `navigator.standalone`). */
  readonly standalone: boolean;
}

/**
 * - `unsupported`        the browser cannot do web push at all
 * - `ios-needs-install`  iPhone/iPad outside the Home Screen app: push only exists in an installed web app
 * - `denied`             the person blocked notifications; only browser settings can undo that
 * - `default`            can ask; the person has not been asked yet
 * - `granted`            can subscribe now
 */
export type PushSupport = "unsupported" | "ios-needs-install" | "denied" | "default" | "granted";

/** `checking` is what the server render and the first client render show, before the browser is asked. */
export type PushSupportState = PushSupport | "checking";

export function isIosDevice(env: Pick<PushEnvironment, "userAgent" | "maxTouchPoints">): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  return env.userAgent.includes("Macintosh") && env.maxTouchPoints > 1;
}

export function pushSupport(env: PushEnvironment): PushSupport {
  // Before the API checks: iOS hides PushManager outside an installed app, and "your browser
  // cannot do push" would send the person away from the fix (Add to Home Screen).
  if (isIosDevice(env) && !env.standalone) return "ios-needs-install";
  if (!env.secureContext || !env.hasServiceWorker || !env.hasPushManager || env.permission === null) {
    return "unsupported";
  }
  return env.permission;
}

/** Whether the enable button can do anything. */
export function canEnablePush(support: PushSupportState): boolean {
  return support === "default" || support === "granted";
}
