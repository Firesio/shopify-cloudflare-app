export interface PushTarget {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface PushRequest {
  readonly target: PushTarget;
  /** The notification as JSON text; the adapter encrypts it for the device. */
  readonly payload: string;
  readonly ttlSeconds: number;
  readonly urgency: "very-low" | "low" | "normal" | "high";
  /** A newer message with the same topic replaces one still waiting at the push service. */
  readonly topic?: string;
}

/**
 * The push service's answer, reduced to what a caller decides on:
 *   sent     — accepted for delivery
 *   gone     — 404/410: the device unsubscribed; forget it
 *   retry    — 429, 5xx, timeout, network: try again later
 *   rejected — anything else (bad keys, rejected VAPID, payload too large): will not succeed
 */
export type PushResult =
  | { readonly kind: "sent" }
  | { readonly kind: "gone" }
  | { readonly kind: "retry"; readonly reason: string; readonly status?: number }
  | { readonly kind: "rejected"; readonly reason: string; readonly status?: number };

export interface PushSender {
  send(request: PushRequest): Promise<PushResult>;
}
