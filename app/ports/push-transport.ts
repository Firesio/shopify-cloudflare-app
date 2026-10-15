import type { PushSender } from "~/ports/push-sender";
import type { PushSubscriptionStore } from "~/ports/push-subscriptions";

/** What the push channel reports about itself. Never carries an endpoint, a key or a payload. */
export type PushChannelLog =
  /** The push service refused our VAPID identity (401/403): a configuration fault, not one device's problem. */
  | { readonly event: "push.vapid_rejected"; readonly status: number }
  /** The message was delivered or the device was dropped, but recording that on the device row failed. */
  | { readonly event: "push.device_update_failed"; readonly operation: "mark_used" | "remove_gone" };

/**
 * Everything the push channel needs to send, handed to it per request.
 *
 * Absent when VAPID keys are not configured: push is optional, and the channel then reports itself unavailable
 * instead of failing later.
 */
export interface PushTransport {
  readonly sender: PushSender;
  readonly devices: Pick<PushSubscriptionStore, "findById" | "removeById" | "markUsed">;
  readonly now: () => number;
  readonly log: (entry: PushChannelLog) => void;
}
