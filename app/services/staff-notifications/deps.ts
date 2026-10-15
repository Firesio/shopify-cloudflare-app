import type { PushSubscriptionStore } from "~/ports/push-subscriptions";
import type { Runtime } from "~/ports/runtime";
import type { StaffPreferenceStore } from "~/ports/staff-notifications";

/** A person may register this many devices; one more is refused (re-registering an existing one is not "one more"). */
export const MAX_DEVICES_PER_ADMIN = 10;

/** Whether this deployment can send push at all, and the key the browser subscribes with. */
export interface PushAvailability {
  readonly configured: boolean;
  /** base64url application server key; only meaningful when `configured`. */
  readonly publicKey: string;
}

export interface StaffNotificationDeps {
  readonly devices: PushSubscriptionStore;
  readonly preferences: StaffPreferenceStore;
  readonly runtime: Runtime;
  readonly push: PushAvailability;
  /**
   * Sends a test notification to one device and says how many were delivered (0 or 1).
   * Supplied by the notification system; this feature only decides who may be tested.
   */
  readonly testPush: (subscriptionId: string) => Promise<number>;
}
