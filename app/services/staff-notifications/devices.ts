import { describeDevice, isAllowedPushEndpoint } from "~/domain/push-device";
import { err, ok, type Result } from "~/lib/result";
import { parsePushSubscription } from "~/schemas/push-subscription";
import { MAX_DEVICES_PER_ADMIN, type StaffNotificationDeps } from "./deps";

export interface RegisterDeviceInput {
  readonly adminId: string;
  /** `PushSubscription.toJSON()` as text, straight from the form. */
  readonly subscription: string;
  readonly userAgent: string;
}

export type RegisterDeviceError = "invalid" | "push_unavailable" | "endpoint_not_allowed" | "too_many_devices" | "not_found";

/**
 * Registers the caller's browser. The endpoint is a URL this Worker will later POST to, so it is checked against the
 * push-service allowlist before it is ever stored. Registering an endpoint the person already has refreshes it and is
 * never counted against the limit; one registered by someone else is moved to them (see the store).
 */
export async function registerDevice(
  input: RegisterDeviceInput,
  deps: StaffNotificationDeps,
): Promise<Result<{ readonly id: string }, RegisterDeviceError>> {
  if (!deps.push.configured) return err("push_unavailable");
  const parsed = parsePushSubscription(input.subscription);
  if (!parsed.ok) return err("invalid");
  const { endpoint, keys } = parsed.value;
  if (!isAllowedPushEndpoint(endpoint)) return err("endpoint_not_allowed");

  const existing = await deps.devices.listForAdmin(input.adminId);
  const alreadyTheirs = existing.some((device) => device.endpoint === endpoint);
  if (!alreadyTheirs && existing.length >= MAX_DEVICES_PER_ADMIN) return err("too_many_devices");

  const { label, kind } = describeDevice(input.userAgent);
  await deps.devices.upsert(input.adminId, {
    id: deps.runtime.ids.uuid(),
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    label,
    kind,
    now: deps.runtime.clock.now(),
  });

  // The row keeps the id it already had when the endpoint existed, so read it back rather than trusting the new one.
  const stored = (await deps.devices.listForAdmin(input.adminId)).find((device) => device.endpoint === endpoint);
  return stored ? ok({ id: stored.id }) : err("not_found");
}

/** Switch one of the caller's own devices on or off. Someone else's device is "not found", not "forbidden". */
export async function setDeviceEnabled(
  input: { readonly adminId: string; readonly id: string; readonly enabled: boolean },
  deps: StaffNotificationDeps,
): Promise<Result<null, "not_found">> {
  return (await deps.devices.setEnabled(input.adminId, input.id, input.enabled)) ? ok(null) : err("not_found");
}

export async function removeDevice(
  input: { readonly adminId: string; readonly id: string },
  deps: StaffNotificationDeps,
): Promise<Result<null, "not_found">> {
  return (await deps.devices.remove(input.adminId, input.id)) ? ok(null) : err("not_found");
}

export type SendTestError = "push_unavailable" | "not_found" | "test_failed";

/**
 * Sends a test notification to one of the caller's devices, or every enabled one when no id is given. The caller's
 * own list decides who may be tested, so another person's device id cannot be targeted. `sent` counts deliveries the
 * push service accepted; none accepted is a failure the person should see.
 */
export async function sendTest(
  input: { readonly adminId: string; readonly id?: string },
  deps: StaffNotificationDeps,
): Promise<Result<{ readonly sent: number }, SendTestError>> {
  if (!deps.push.configured) return err("push_unavailable");
  const own = await deps.devices.listForAdmin(input.adminId);
  const targets = input.id === undefined ? own.filter((device) => device.enabled) : own.filter((device) => device.id === input.id);
  if (targets.length === 0) return err("not_found");

  let sent = 0;
  for (const device of targets) {
    try {
      sent += await deps.testPush(device.id);
    } catch (error) {
      console.error(JSON.stringify({ event: "staff_push.test_failed", error: error instanceof Error ? error.message : "unknown" }));
    }
  }
  return sent > 0 ? ok({ sent }) : err("test_failed");
}
