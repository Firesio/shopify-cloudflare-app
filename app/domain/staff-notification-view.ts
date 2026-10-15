import type { StaffChannel, StaffMatrixRow, StaffTopic } from "./staff-notification-topics";
import type { DeviceKind } from "~/ports/push-subscriptions";

/**
 * The contract between the notification settings route (server) and its page
 * (browser). The page never receives a push endpoint or key: a device is shown
 * by id and a hash of its endpoint, which is how the browser recognises its own
 * registration without the server ever sending the secret back.
 */
export interface DeviceView {
  readonly id: string;
  readonly label: string;
  readonly kind: DeviceKind;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly lastUsedAt: number | null;
  /** SHA-256 (hex) of the endpoint. The browser hashes its own and compares. */
  readonly endpointHash: string;
}

export interface NotificationSettingsView {
  readonly matrix: readonly StaffMatrixRow[];
  readonly devices: readonly DeviceView[];
  readonly push: {
    /** False when the deployment has no VAPID keys: push cannot work at all, say so. */
    readonly configured: boolean;
    /** The application server key the browser subscribes with (base64url). Empty when not configured. */
    readonly publicKey: string;
    readonly maxDevices: number;
  };
}

/** The route's action intents (command dispatch). Field names are part of the contract. */
export const NOTIFICATION_INTENTS = [
  "preference", //     topic, channel, enabled ("true" | "false")
  "subscribe", //      subscription (JSON of PushSubscription.toJSON())
  "device-enabled", // id, enabled
  "device-remove", //  id
  "test", //           id (optional: omit to test every enabled device)
] as const;
export type NotificationIntent = (typeof NOTIFICATION_INTENTS)[number];

export function isNotificationIntent(value: string): value is NotificationIntent {
  return NOTIFICATION_INTENTS.some((intent) => intent === value);
}

export type NotificationActionError =
  | "invalid"
  | "push_unavailable"
  | "endpoint_not_allowed"
  | "too_many_devices"
  | "not_found"
  | "test_failed";

export type NotificationActionSuccess =
  | { readonly success: "preference"; readonly topic: StaffTopic; readonly channel: StaffChannel }
  | { readonly success: "subscribed"; readonly id: string }
  | { readonly success: "device-enabled" | "device-removed" }
  | { readonly success: "test-sent"; readonly sent: number };

export type NotificationActionResult = NotificationActionSuccess | { readonly error: NotificationActionError };
