import { buildMatrix, type StaffChannel, type StaffTopic } from "~/domain/staff-notification-topics";
import type { DeviceView, NotificationSettingsView } from "~/domain/staff-notification-view";
import { hashToken } from "~/lib/token";
import { ok, type Result } from "~/lib/result";
import type { PushSubscriptionRecord } from "~/ports/push-subscriptions";
import { MAX_DEVICES_PER_ADMIN, type StaffNotificationDeps } from "./deps";

/** The page's view of a device: never the endpoint or the keys, only a hash the browser can match against its own. */
async function toDeviceView(record: PushSubscriptionRecord): Promise<DeviceView> {
  return {
    id: record.id,
    label: record.label,
    kind: record.kind,
    enabled: record.enabled,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    endpointHash: await hashToken(record.endpoint),
  };
}

/** Everything the settings page shows for one person. */
export async function loadSettings(adminId: string, deps: StaffNotificationDeps): Promise<NotificationSettingsView> {
  const [preferences, records] = await Promise.all([deps.preferences.list(adminId), deps.devices.listForAdmin(adminId)]);
  return {
    matrix: buildMatrix(preferences),
    devices: await Promise.all(records.map(toDeviceView)),
    push: {
      configured: deps.push.configured,
      publicKey: deps.push.configured ? deps.push.publicKey : "",
      maxDevices: MAX_DEVICES_PER_ADMIN,
    },
  };
}

export interface SetPreferenceInput {
  readonly adminId: string;
  readonly topic: StaffTopic;
  readonly channel: StaffChannel;
  readonly enabled: boolean;
}

/** One on/off for (topic, channel), stored for this person only. Topic and channel are already catalogue values. */
export async function setPreference(
  input: SetPreferenceInput,
  deps: StaffNotificationDeps,
): Promise<Result<{ readonly topic: StaffTopic; readonly channel: StaffChannel }, never>> {
  await deps.preferences.set(input.adminId, input.topic, input.channel, input.enabled, deps.runtime.clock.now());
  return ok({ topic: input.topic, channel: input.channel });
}
