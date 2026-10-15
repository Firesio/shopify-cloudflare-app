import type { PushRequest, PushResult } from "~/ports/push-sender";
import type { PushSubscriptionRecord } from "~/ports/push-subscriptions";
import type { PushTransport } from "~/ports/push-transport";
import type { Channel, PushMessage, SendContext, SendOutcome } from "../../types";
import { encodePushPayload } from "./payload";

/** 401 and 403 from the push service mean it does not accept OUR identity, whichever device we were sending to. */
const VAPID_REFUSED = new Set([401, 403]);

/**
 * Web Push to one staff device.
 *
 * TRANSPORT ONLY, like the email channel: no logging of the notification, no dedupe, no quota — `dispatch` owns
 * those. Everything it knows is "put this message on the wire to this device, or explain why not".
 *
 * Outcomes, and why each is what it is:
 *   unavailable / unknown / switched off / gone  → `refused`. Nothing a retry can fix: the queue acks it, and the
 *                                                  row says why the person did not get it.
 *   retry (429, 5xx, timeout, network)           → retriable `failed`, so the queue backs off and tries again.
 *   rejected                                     → permanent `failed`; a 401/403 is also logged as a VAPID problem.
 *
 * The endpoint and keys are read from the device row only here, passed to the sender, and never put in an outcome,
 * a detail string or a log entry: the endpoint is a capability to wake the device.
 */
export class PushChannel implements Channel<PushMessage> {
  readonly key = "push" as const;

  async send(message: PushMessage, context: SendContext): Promise<SendOutcome> {
    const transport = context.push;
    if (!transport) {
      return {
        status: "refused",
        reason: "channel_unavailable",
        detail: "Web Push is not set up. Set VAPID_PUBLIC_KEY and the VAPID_PRIVATE_KEY secret.",
      };
    }

    const device = await transport.devices.findById(message.to);
    if (!device) return { status: "refused", reason: "recipient_unreachable", detail: "The device is no longer registered." };
    if (!device.enabled) return { status: "refused", reason: "recipient_unreachable", detail: "The device is switched off." };

    const result = await transport.sender.send(requestFor(message, device));
    return settle(result, message, transport);
  }
}

function requestFor(message: PushMessage, device: PushSubscriptionRecord): PushRequest {
  return {
    target: { endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth },
    payload: encodePushPayload(message),
    ttlSeconds: message.ttlSeconds,
    urgency: message.urgency,
    // A newer message for the same thing replaces one still waiting at the push service.
    topic: message.tag,
  };
}

async function settle(result: PushResult, message: PushMessage, transport: PushTransport): Promise<SendOutcome> {
  switch (result.kind) {
    case "sent":
      await recordUse(message.to, transport);
      return { status: "sent", providerStatus: "accepted" };
    case "gone":
      await forget(message.to, transport);
      return { status: "refused", reason: "recipient_unreachable", detail: "The push service reports the device unsubscribed; it was removed." };
    case "retry":
      return {
        status: "failed",
        reason: result.status === 429 ? "throttled" : "transport_error",
        retriable: true,
        detail: result.reason,
        ...(result.status === undefined ? {} : { providerStatus: String(result.status) }),
      };
    case "rejected":
      if (result.status !== undefined && VAPID_REFUSED.has(result.status)) {
        transport.log({ event: "push.vapid_rejected", status: result.status });
      }
      return {
        status: "failed",
        reason: "rejected",
        retriable: false,
        detail: result.reason,
        ...(result.status === undefined ? {} : { providerStatus: String(result.status) }),
      };
    default:
      return assertNever(result);
  }
}

/**
 * The push was accepted: a failure to note the device's last use must not become a retry, which would send it twice.
 */
async function recordUse(subscriptionId: string, transport: PushTransport): Promise<void> {
  try {
    await transport.devices.markUsed(subscriptionId, transport.now());
  } catch {
    transport.log({ event: "push.device_update_failed", operation: "mark_used" });
  }
}

/** The device is gone either way; failing to delete its row is logged and the next send finds it gone again. */
async function forget(subscriptionId: string, transport: PushTransport): Promise<void> {
  try {
    await transport.devices.removeById(subscriptionId);
  } catch {
    transport.log({ event: "push.device_update_failed", operation: "remove_gone" });
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled push result: ${JSON.stringify(value)}`);
}

export const pushChannel = new PushChannel();
