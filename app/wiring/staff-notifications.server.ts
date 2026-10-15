import { PushSubscriptionRepo } from "~/models/push-subscriptions.server";
import { StaffPreferenceRepo, StaffRecipientsRepo } from "~/models/staff-notifications.server";
import type { PushSubscriptionStore } from "~/ports/push-subscriptions";
import type { StaffNotificationRecipients, StaffPreferenceStore } from "~/ports/staff-notifications";
import { sendTestPush, type StaffNotificationDeps } from "~/services/staff-notifications";
import { immediateNotifier } from "~/wiring/notifications.server";
import { pushConfig } from "~/wiring/push.server";
import { appRuntime } from "~/wiring/runtime.server";

/** Staff devices registered for web push. Admin-scoped; see the model. */
export function pushSubscriptionStore(): PushSubscriptionStore {
  return new PushSubscriptionRepo();
}

/** Each staff member's own on/off choices per topic and channel. */
export function staffPreferenceStore(): StaffPreferenceStore {
  return new StaffPreferenceRepo();
}

/** Who should hear about a topic, decided by each person's settings. The notification system's read side. */
export function staffNotificationRecipients(): StaffNotificationRecipients {
  return new StaffRecipientsRepo();
}

/**
 * Everything the notification settings use cases need, for one request. A test message is a real `push_test`
 * notification through the same channel as every other push; with no VAPID keys push is not an available channel and
 * the use case has already refused.
 */
export function staffNotificationSettings(): StaffNotificationDeps {
  const runtime = appRuntime();
  const notifier = immediateNotifier();
  return {
    devices: pushSubscriptionStore(),
    preferences: staffPreferenceStore(),
    runtime,
    push: pushConfig(),
    testPush: (deviceId) => sendTestPush(deviceId, { notifier, newId: () => runtime.ids.uuid() }),
  };
}
