import type { NotificationActionError, NotificationActionResult } from "~/domain/staff-notification-view";
import type { StaffChannel, StaffMatrixRow, StaffTopicGroup } from "~/domain/staff-notification-topics";
import { STAFF_TOPIC_GROUP_LABEL } from "~/domain/staff-notification-topics";
import type { ActionMessage } from "~/lib/action-feedback";
import type { PushError } from "~/internal/push/subscription";

/**
 * The words of this page, as pure data: what each outcome of the notifications action
 * and of the browser's own push steps is called. The console is English-only
 * (@rules/i18n.md), so these are plain strings, not translation keys.
 */
export const ERROR_MESSAGES: Record<NotificationActionError, string> = {
  invalid: "That request was not valid. Reload the page and try again.",
  push_unavailable: "Push notifications are not set up for this deployment.",
  endpoint_not_allowed: "This browser's push service is not supported.",
  too_many_devices: "You have reached the device limit. Remove a device first.",
  not_found: "That device no longer exists. Reload the page.",
  test_failed: "The test notification could not be sent.",
};

export const PUSH_ERROR_MESSAGES: Record<PushError, string> = {
  "permission-denied": "Notifications are blocked for this site. Allow them in your browser's settings, then try again.",
  "permission-dismissed": "You closed the permission prompt without choosing. Try again and choose Allow.",
  "registration-failed": "This browser could not start the notification service worker.",
  "key-invalid": "The server's push key is not valid, so this browser cannot subscribe.",
  "subscribe-failed": "This browser could not create a push subscription. Try again.",
  "push-service-timeout":
    "This browser's push service did not answer. Check that push messaging is allowed in its settings (in Brave, turn on \"Use Google services for push messaging\"), then try again.",
};

export const CHANNEL_LABEL: Record<StaffChannel, string> = { email: "Email", push: "Push" };

/** What to toast for an action result; a switch flipping is its own confirmation, so a preference stays quiet. */
export function describeResult(result: NotificationActionResult | undefined): ActionMessage {
  if (result === undefined) return undefined;
  if ("error" in result) return { error: ERROR_MESSAGES[result.error] };
  switch (result.success) {
    case "preference":
      return undefined;
    case "subscribed":
      return { success: "This device will now receive notifications." };
    case "device-enabled":
      return { success: "Device updated." };
    case "device-removed":
      return { success: "Device removed." };
    case "test-sent":
      return result.sent > 0
        ? { success: `Test sent to ${result.sent} ${result.sent === 1 ? "device" : "devices"}.` }
        : { error: "No device could be reached. Check that the device is turned on and try again." };
  }
}

export interface MatrixGroup {
  readonly group: StaffTopicGroup;
  readonly label: string;
  readonly rows: readonly StaffMatrixRow[];
}

/** The matrix rows gathered under their group heading, groups and rows in the order they arrive. */
export function groupMatrix(matrix: readonly StaffMatrixRow[]): readonly MatrixGroup[] {
  const groups: MatrixGroup[] = [];
  for (const row of matrix) {
    const existing = groups.find((candidate) => candidate.group === row.group);
    if (existing) {
      groups[groups.indexOf(existing)] = { ...existing, rows: [...existing.rows, row] };
    } else {
      groups.push({ group: row.group, label: STAFF_TOPIC_GROUP_LABEL[row.group], rows: [row] });
    }
  }
  return groups;
}
