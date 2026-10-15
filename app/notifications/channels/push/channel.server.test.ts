import { describe, expect, it } from "vitest";
import type { PushChannelLog, PushTransport } from "~/ports/push-transport";
import type { PushRequest, PushResult, PushSender } from "~/ports/push-sender";
import { FakePushSubscriptions } from "~/test/fake-staff-notifications";
import type { PushMessage } from "../../types";
import { PushChannel } from "./channel.server";

const ENDPOINT = "https://push.fake-service.invalid/send/secret-capability-token";

class FakeSender implements PushSender {
  readonly sent: PushRequest[] = [];
  constructor(private readonly result: PushResult) {}
  async send(request: PushRequest): Promise<PushResult> {
    this.sent.push(request);
    return this.result;
  }
}

const message = (over: Partial<PushMessage> = {}): PushMessage => ({
  kind: "push",
  to: "d1",
  title: "New support ticket · Alpha",
  body: "Checkout is broken",
  url: "/internal/support/t-1",
  tag: "ticket:t-1",
  topic: "support_ticket_opened",
  urgency: "high",
  ttlSeconds: 86_400,
  ...over,
});

async function setup(result: PushResult, options: { enabled?: boolean } = {}) {
  const devices = new FakePushSubscriptions();
  await devices.upsert("admin-1", { id: "d1", endpoint: ENDPOINT, p256dh: "p256dh-key", auth: "auth-secret", label: "Chrome on Android", kind: "phone", now: 1 });
  if (options.enabled === false) await devices.setEnabled("admin-1", "d1", false);
  const sender = new FakeSender(result);
  const logged: PushChannelLog[] = [];
  const transport: PushTransport = { sender, devices, now: () => 4_242, log: (entry) => { logged.push(entry); } };
  return { channel: new PushChannel(), transport, sender, devices, logged };
}

describe("PushChannel", () => {
  it("sends the encoded payload to the device's endpoint and records the use", async () => {
    const { channel, transport, sender, devices } = await setup({ kind: "sent" });
    const outcome = await channel.send(message(), { push: transport });

    expect(outcome).toEqual({ status: "sent", providerStatus: "accepted" });
    expect(sender.sent).toHaveLength(1);
    const [request] = sender.sent;
    expect(request?.target).toEqual({ endpoint: ENDPOINT, p256dh: "p256dh-key", auth: "auth-secret" });
    expect(JSON.parse(request?.payload ?? "{}")).toEqual({
      title: "New support ticket · Alpha",
      body: "Checkout is broken",
      url: "/internal/support/t-1",
      tag: "ticket:t-1",
      topic: "support_ticket_opened",
    });
    expect(request).toMatchObject({ ttlSeconds: 86_400, urgency: "high", topic: "ticket:t-1" });
    expect((await devices.findById("d1"))?.lastUsedAt).toBe(4_242);
  });

  it("is unavailable, and sends nothing, when push is not configured", async () => {
    const { channel, sender } = await setup({ kind: "sent" });
    expect(await channel.send(message(), {})).toMatchObject({ status: "refused", reason: "channel_unavailable" });
    expect(sender.sent).toEqual([]);
  });

  it("refuses a device that is no longer registered, without calling the push service", async () => {
    const { channel, transport, sender } = await setup({ kind: "sent" });
    expect(await channel.send(message({ to: "missing" }), { push: transport })).toMatchObject({ status: "refused", reason: "recipient_unreachable" });
    expect(sender.sent).toEqual([]);
  });

  it("refuses a device the person switched off, and keeps it", async () => {
    const { channel, transport, sender, devices } = await setup({ kind: "sent" }, { enabled: false });
    expect(await channel.send(message(), { push: transport })).toMatchObject({ status: "refused", reason: "recipient_unreachable" });
    expect(sender.sent).toEqual([]);
    expect(await devices.findById("d1")).toBeDefined();
  });

  it("forgets a device the push service says is gone, and refuses rather than retries", async () => {
    const { channel, transport, devices } = await setup({ kind: "gone" });
    const outcome = await channel.send(message(), { push: transport });
    expect(outcome).toMatchObject({ status: "refused", reason: "recipient_unreachable" });
    expect(await devices.findById("d1")).toBeUndefined();
  });

  it.each([
    [{ kind: "retry", reason: "timeout" }, "transport_error"],
    [{ kind: "retry", reason: "http_503", status: 503 }, "transport_error"],
    [{ kind: "retry", reason: "http_429", status: 429 }, "throttled"],
  ] as const)("asks for another attempt, and keeps the device, on %j", async (result, reason) => {
    const { channel, transport, devices } = await setup(result);
    const outcome = await channel.send(message(), { push: transport });
    expect(outcome).toMatchObject({ status: "failed", reason, retriable: true });
    expect(await devices.findById("d1")).toBeDefined();
  });

  it("fails permanently when the push service rejects the message, without logging a VAPID fault", async () => {
    const { channel, transport, devices, logged } = await setup({ kind: "rejected", reason: "payload_too_large", status: 413 });
    const outcome = await channel.send(message(), { push: transport });
    expect(outcome).toMatchObject({ status: "failed", reason: "rejected", retriable: false, providerStatus: "413" });
    expect(logged).toEqual([]);
    expect(await devices.findById("d1")).toBeDefined();
  });

  it.each([401, 403])("logs a %i as a VAPID rejection, because it is a configuration fault", async (status) => {
    const { channel, transport, logged } = await setup({ kind: "rejected", reason: `http_${status}`, status });
    const outcome = await channel.send(message(), { push: transport });
    expect(outcome).toMatchObject({ status: "failed", reason: "rejected", retriable: false });
    expect(logged).toEqual([{ event: "push.vapid_rejected", status }]);
  });

  it("still reports sent when noting the device's use fails, so the queue does not send it twice", async () => {
    const { channel, transport, logged } = await setup({ kind: "sent" });
    const failing: PushTransport = {
      ...transport,
      devices: {
        findById: (id) => transport.devices.findById(id),
        removeById: (id) => transport.devices.removeById(id),
        markUsed: async () => { throw new Error("db down"); },
      },
    };
    expect(await channel.send(message(), { push: failing })).toMatchObject({ status: "sent" });
    expect(logged).toEqual([{ event: "push.device_update_failed", operation: "mark_used" }]);
  });

  it("never puts the endpoint, the keys or the payload in an outcome or a log entry", async () => {
    const cases: PushResult[] = [
      { kind: "sent" },
      { kind: "gone" },
      { kind: "retry", reason: "timeout" },
      { kind: "rejected", reason: "http_403", status: 403 },
    ];
    for (const result of cases) {
      const { channel, transport, logged } = await setup(result);
      const outcome = await channel.send(message(), { push: transport });
      const visible = JSON.stringify({ outcome, logged });
      expect(visible).not.toContain("secret-capability-token");
      expect(visible).not.toContain("push.fake-service");
      expect(visible).not.toContain("auth-secret");
      expect(visible).not.toContain("p256dh-key");
      expect(visible).not.toContain("Checkout is broken");
    }
  });
});
