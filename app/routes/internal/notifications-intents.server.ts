import { z } from "zod";
import { STAFF_CHANNELS, STAFF_TOPICS } from "~/domain/staff-notification-topics";
import {
  isNotificationIntent,
  type NotificationActionError,
  type NotificationActionSuccess,
  type NotificationIntent,
} from "~/domain/staff-notification-view";
import { err, ok, type Result } from "~/lib/result";
import { MAX_SUBSCRIPTION_JSON_LENGTH } from "~/schemas/push-subscription";
import {
  registerDevice,
  removeDevice,
  sendTest,
  setDeviceEnabled,
  setPreference,
  type StaffNotificationDeps,
} from "~/services/staff-notifications";

/** Everything an intent needs besides its own fields: who is acting, from which browser, with which dependencies. */
export interface IntentContext {
  readonly adminId: string;
  readonly userAgent: string;
  readonly deps: StaffNotificationDeps;
}

export type IntentOutcome = Result<NotificationActionSuccess, NotificationActionError>;
type Handler = (fields: Readonly<Record<string, FormDataEntryValue>>, context: IntentContext) => Promise<IntentOutcome>;

const id = z.string().min(1).max(64);
const flag = z.enum(["true", "false"]).transform((value) => value === "true");

const preferenceFields = z.object({ topic: z.enum(STAFF_TOPICS), channel: z.enum(STAFF_CHANNELS), enabled: flag });
const subscribeFields = z.object({ subscription: z.string().min(1).max(MAX_SUBSCRIPTION_JSON_LENGTH) });
const deviceEnabledFields = z.object({ id, enabled: flag });
const deviceRemoveFields = z.object({ id });
/** An empty id means "every enabled device". */
const testFields = z.object({ id: id.optional() });

/**
 * Command dispatch on the submitted intent (@rules/design-patterns.md): the action only looks a handler up, and each
 * handler parses its own fields, calls one use case and shapes the success. Keyed by the intent union, so a new intent
 * cannot ship without one.
 */
export const NOTIFICATION_HANDLERS: Record<NotificationIntent, Handler> = {
  async preference(fields, { adminId, deps }) {
    const parsed = preferenceFields.safeParse(fields);
    if (!parsed.success) return err("invalid");
    const result = await setPreference({ adminId, ...parsed.data }, deps);
    return result.ok ? ok({ success: "preference", topic: result.value.topic, channel: result.value.channel }) : result;
  },
  async subscribe(fields, { adminId, userAgent, deps }) {
    const parsed = subscribeFields.safeParse(fields);
    if (!parsed.success) return err("invalid");
    const result = await registerDevice({ adminId, subscription: parsed.data.subscription, userAgent }, deps);
    return result.ok ? ok({ success: "subscribed", id: result.value.id }) : result;
  },
  async "device-enabled"(fields, { adminId, deps }) {
    const parsed = deviceEnabledFields.safeParse(fields);
    if (!parsed.success) return err("invalid");
    const result = await setDeviceEnabled({ adminId, ...parsed.data }, deps);
    return result.ok ? ok({ success: "device-enabled" }) : result;
  },
  async "device-remove"(fields, { adminId, deps }) {
    const parsed = deviceRemoveFields.safeParse(fields);
    if (!parsed.success) return err("invalid");
    const result = await removeDevice({ adminId, id: parsed.data.id }, deps);
    return result.ok ? ok({ success: "device-removed" }) : result;
  },
  async test(fields, { adminId, deps }) {
    const parsed = testFields.safeParse({ id: fields.id === "" ? undefined : fields.id });
    if (!parsed.success) return err("invalid");
    const result = await sendTest({ adminId, id: parsed.data.id }, deps);
    return result.ok ? ok({ success: "test-sent", sent: result.value.sent }) : result;
  },
};

/** The submitted intent, narrowed by guard (never asserted): it comes off a form, so it is attacker-controlled. */
export function readNotificationIntent(fields: Readonly<Record<string, FormDataEntryValue>>): NotificationIntent | null {
  const value = fields.intent;
  return typeof value === "string" && isNotificationIntent(value) ? value : null;
}
