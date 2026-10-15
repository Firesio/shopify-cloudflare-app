import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { decodeBase64Url } from "~/lib/base64url";
import { generateVapidKeys } from "~/lib/web-push/vapid";
import { AdminUserRepo } from "~/models/admin-users.server";
import { NotificationLogRepo } from "~/models/notification-logs.server";
import { PushSubscriptionRepo } from "~/models/push-subscriptions.server";
import type { PushRequest, PushResult, PushSender } from "~/ports/push-sender";
import type { PushChannelLog, PushTransport } from "~/ports/push-transport";
import { runWithRequestContext } from "~/request-context.server";
import { handleNotificationBatch } from "~/services/notification-queue";
import { staffNotificationSettings } from "~/wiring.server";
import { notificationConsumerDependencies, notificationDependencies } from "~/wiring/notifications.server";
import { recordedMessage } from "~/test/fake-notification-queue";
import { setupTestDatabase } from "~/test/db";
import { decryptPush } from "~/test/web-push-decrypt";
import { notify } from "./notify.server";
import { toEnvelope, type QueuedNotification } from "./envelope";
import { sendTest } from "~/services/staff-notifications";

setupTestDatabase();
afterEach(() => vi.unstubAllGlobals());

// RFC 8291 Appendix A user agent: a real keypair, so the real sender's encryption can be decrypted again.
const UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const UA_PRIVATE = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94";
const UA_AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
const ENDPOINT = "https://push.fake-service.invalid/send/capability-token-1";
const NOW = 1_800_000_000_000;

const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);
const rows = () => inRequest(() => new NotificationLogRepo().recent());

async function registerDevice(id = "device-1", options: { enabled?: boolean } = {}) {
  await inRequest(async () => {
    const users = new AdminUserRepo();
    if ((await users.findById("admin-1")) === undefined) {
      await users.create({ id: "admin-1", email: "ada@workmanjsc.vn", name: "Ada", passwordHash: "x", role: "admin", now: NOW });
    }
    const repo = new PushSubscriptionRepo();
    await repo.upsert("admin-1", { id, endpoint: id === "device-1" ? ENDPOINT : `${ENDPOINT}-${id}`, p256dh: UA_PUBLIC, auth: UA_AUTH, label: "Chrome on Android", kind: "phone", now: NOW });
    if (options.enabled === false) await repo.setEnabled("admin-1", id, false);
  });
}

const deviceRow = (id = "device-1") => inRequest(() => new PushSubscriptionRepo().findById(id));

const ticketOpened = (device: string, dedupeKey = "ticket-opened:t-1"): QueuedNotification => ({
  event: "support_merchant_activity",
  to: { push: device },
  dedupeKey,
  payload: {
    recipientName: "Staff",
    shopName: "Alpha Store",
    subject: "Checkout is broken",
    excerpt: "It fails at payment.",
    threadUrl: "https://app.workmanjsc.vn/internal/support/t-1",
    isNew: true,
  },
});

class FakeSender implements PushSender {
  readonly sent: PushRequest[] = [];
  constructor(private result: PushResult) {}
  answer(result: PushResult) { this.result = result; }
  async send(request: PushRequest): Promise<PushResult> {
    this.sent.push(request);
    return this.result;
  }
}

/** The real consumer, `notify()` and D1 (logs and devices); only the push service itself is the fake sender. */
function consumerWith(sender: PushSender, options: { configured?: boolean } = {}) {
  const logged: PushChannelLog[] = [];
  return {
    logged,
    run: async (body: unknown, attempts: number) => {
      const message = recordedMessage(body, attempts);
      await inRequest(async () => {
        const transport: PushTransport = { sender, devices: new PushSubscriptionRepo(), now: () => NOW, log: (entry) => { logged.push(entry); } };
        await handleNotificationBatch({ messages: [message] }, {
          send: (request) => notify(request, {
            ...notificationDependencies(),
            availableChannels: options.configured === false ? ["email"] : ["email", "push"],
            ...(options.configured === false ? {} : { push: transport }),
          }),
          log: () => undefined,
        });
      });
      return message;
    },
  };
}

describe("the push channel through the notification consumer, against real D1", () => {
  it("sends once and writes one sent row when the same message is delivered twice", async () => {
    await registerDevice();
    const sender = new FakeSender({ kind: "sent" });
    const consumer = consumerWith(sender);
    const body = toEnvelope(ticketOpened("device-1"));

    const first = await consumer.run(body, 1);
    const redelivery = await consumer.run(body, 2);

    expect(first.settled).toEqual(["ack"]);
    expect(redelivery.settled).toEqual(["ack"]);
    expect(sender.sent).toHaveLength(1);
    const stored = await rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      status: "sent",
      channel: "push",
      recipient: "device-1",
      event: "support_merchant_activity",
      dedupeKey: "ticket-opened:t-1",
    });
    expect((await deviceRow())?.lastUsedAt).toBe(NOW);
  });

  it("sends to each of two devices once, under one dedupe key shared by both", async () => {
    await registerDevice("device-1");
    await registerDevice("device-3");
    const sender = new FakeSender({ kind: "sent" });
    const consumer = consumerWith(sender);

    await consumer.run(toEnvelope(ticketOpened("device-1")), 1);
    await consumer.run(toEnvelope(ticketOpened("device-3")), 1);
    await consumer.run(toEnvelope(ticketOpened("device-3")), 2);

    expect(sender.sent).toHaveLength(2);
    expect((await rows()).map((row) => row.recipient).sort()).toEqual(["device-1", "device-3"]);
  });

  it("leaves no refused row for the email channel the request never addressed", async () => {
    await registerDevice();
    await consumerWith(new FakeSender({ kind: "sent" })).run(toEnvelope(ticketOpened("device-1")), 1);
    expect((await rows()).map((row) => row.channel)).toEqual(["push"]);
  });

  it("forgets a gone device and acknowledges: no retry, and a refused row says why", async () => {
    await registerDevice();
    const sender = new FakeSender({ kind: "gone" });
    const message = await consumerWith(sender).run(toEnvelope(ticketOpened("device-1")), 1);

    expect(message.settled).toEqual(["ack"]);
    expect(await deviceRow()).toBeUndefined();
    expect((await rows())[0]).toMatchObject({ status: "refused", reasonCode: "recipient_unreachable", channel: "push" });
    expect(sender.sent).toHaveLength(1);
  });

  it("retries with a delay when the push service is unavailable, then sends on the next delivery", async () => {
    await registerDevice();
    const sender = new FakeSender({ kind: "retry", reason: "http_503", status: 503 });
    const consumer = consumerWith(sender);
    const body = toEnvelope({ ...ticketOpened("device-1"), logId: "pre-minted-log" });

    const failed = await consumer.run(body, 1);
    expect(failed.settled).toEqual(["retry:30"]);
    expect((await rows()).map((row) => row.status)).toEqual(["failed"]);
    expect((await deviceRow())?.lastUsedAt).toBeNull();

    sender.answer({ kind: "sent" });
    const recovered = await consumer.run(body, 2);
    expect(recovered.settled).toEqual(["ack"]);
    expect((await rows()).map((row) => row.status).sort()).toEqual(["failed", "sent"]);
    expect((await deviceRow())?.lastUsedAt).toBe(NOW);
  });

  it("records a permanent rejection as a failed row, acknowledges it, and keeps the device", async () => {
    await registerDevice();
    const sender = new FakeSender({ kind: "rejected", reason: "http_400", status: 400 });
    const message = await consumerWith(sender).run(toEnvelope(ticketOpened("device-1")), 1);

    expect(message.settled).toEqual(["ack"]);
    expect(sender.sent).toHaveLength(1);
    expect((await rows())[0]).toMatchObject({ status: "failed", reasonCode: "rejected", providerStatus: "400" });
    expect(await deviceRow()).toBeDefined();
  });

  it("reports a rejected VAPID identity as an error event and still acknowledges", async () => {
    await registerDevice();
    const consumer = consumerWith(new FakeSender({ kind: "rejected", reason: "http_403", status: 403 }));
    const message = await consumer.run(toEnvelope(ticketOpened("device-1")), 1);
    expect(message.settled).toEqual(["ack"]);
    expect(consumer.logged).toEqual([{ event: "push.vapid_rejected", status: 403 }]);
  });

  it.each([
    ["registered no more", undefined],
    ["switched off", { enabled: false }],
  ] as const)("refuses, with no call to the push service, a device that is %s", async (_name, options) => {
    if (options) await registerDevice("device-1", options);
    const sender = new FakeSender({ kind: "sent" });
    const message = await consumerWith(sender).run(toEnvelope(ticketOpened("device-1")), 1);
    expect(message.settled).toEqual(["ack"]);
    expect(sender.sent).toEqual([]);
    expect((await rows())[0]).toMatchObject({ status: "refused", reasonCode: "recipient_unreachable" });
  });

  it("refuses as channel_unavailable, recording the device id, when push is not configured", async () => {
    await registerDevice();
    const sender = new FakeSender({ kind: "sent" });
    const message = await consumerWith(sender, { configured: false }).run(toEnvelope(ticketOpened("device-1")), 1);
    expect(message.settled).toEqual(["ack"]);
    expect(sender.sent).toEqual([]);
    expect((await rows())[0]).toMatchObject({ status: "refused", reasonCode: "channel_unavailable", channel: "push", recipient: "device-1" });
  });

  it("never stores the endpoint or keys in the history", async () => {
    await registerDevice();
    await consumerWith(new FakeSender({ kind: "gone" })).run(toEnvelope(ticketOpened("device-1")), 1);
    await registerDevice("device-2");
    await consumerWith(new FakeSender({ kind: "retry", reason: "timeout" })).run(toEnvelope(ticketOpened("device-2", "other")), 1);
    const stored = JSON.stringify(await rows());
    expect(stored).not.toContain("capability-token-1");
    expect(stored).not.toContain("fake-service");
    expect(stored).not.toContain(UA_AUTH);
  });
});

/**
 * The real wiring end to end: VAPID configured through the environment, the real sender encrypting, and only the HTTP
 * call to the push service replaced. What arrives is decrypted again the way a browser would.
 */
describe("push through the real wiring, with only the push service's HTTP call faked", () => {
  async function withVapid() {
    const keys = await generateVapidKeys();
    return Object.assign({}, env, { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, SHOPIFY_APP_URL: "https://app.workmanjsc.vn" });
  }

  function stubPushService(status = 201) {
    const calls: { url: string; headers: Headers; body: Uint8Array }[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body;
      if (!(body instanceof Uint8Array)) throw new Error("expected an encrypted byte body");
      calls.push({ url: String(input), headers: new Headers(init?.headers), body });
      return new Response(null, { status });
    });
    return calls;
  }

  const decrypted = async (body: Uint8Array) => {
    const decode = (text: string) => {
      const bytes = decodeBase64Url(text);
      if (bytes === null) throw new Error("bad fixture");
      return bytes;
    };
    const result = await decryptPush({ body, userAgentPrivateKey: decode(UA_PRIVATE), userAgentPublicKey: decode(UA_PUBLIC), authSecret: decode(UA_AUTH) });
    return JSON.parse(new TextDecoder().decode(result.plaintext));
  };

  it("delivers a real notification once to the push service, and a redelivery changes nothing", async () => {
    await registerDevice();
    const calls = stubPushService();
    const context = await withVapid();
    const body = toEnvelope(ticketOpened("device-1"));

    for (const attempts of [1, 2]) {
      const message = recordedMessage(body, attempts);
      await runWithRequestContext(context, () => handleNotificationBatch({ messages: [message] }, notificationConsumerDependencies()));
      expect(message.settled).toEqual(["ack"]);
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(ENDPOINT);
    expect(calls[0]?.headers.get("urgency")).toBe("high");
    expect(calls[0]?.headers.get("ttl")).toBe("86400");
    expect(await decrypted(calls[0]?.body ?? new Uint8Array())).toEqual({
      title: "New support ticket · Alpha Store",
      body: "Checkout is broken",
      url: "/internal/support/t-1",
      tag: "ticket:t-1",
      topic: "support_ticket_opened",
    });
    expect((await rows()).map((row) => row.status)).toEqual(["sent"]);
  });

  it("is an unavailable channel, not a failing one, when VAPID is not configured", async () => {
    await registerDevice();
    const calls = stubPushService();
    const message = recordedMessage(toEnvelope(ticketOpened("device-1")), 1);
    await inRequest(() => handleNotificationBatch({ messages: [message] }, notificationConsumerDependencies()));
    expect(message.settled).toEqual(["ack"]);
    expect(calls).toEqual([]);
    expect((await rows())[0]).toMatchObject({ status: "refused", reasonCode: "channel_unavailable" });
  });

  it("sends a test notification through the same channel, and leaves a push_test row", async () => {
    await registerDevice();
    const calls = stubPushService();
    const context = await withVapid();

    const result = await runWithRequestContext(context, () => sendTest({ adminId: "admin-1", id: "device-1" }, staffNotificationSettings()));

    expect(result).toEqual({ ok: true, value: { sent: 1 } });
    expect(calls).toHaveLength(1);
    expect(await decrypted(calls[0]?.body ?? new Uint8Array())).toMatchObject({ title: "Test notification", url: "/internal/notifications", topic: "staff_test" });
    expect(calls[0]?.headers.get("ttl")).toBe("60");
    expect((await rows())[0]).toMatchObject({ event: "push_test", channel: "push", status: "sent", recipient: "device-1" });

    // A second press is a second send: the test never dedupes against the last one.
    await runWithRequestContext(context, () => sendTest({ adminId: "admin-1", id: "device-1" }, staffNotificationSettings()));
    expect(calls).toHaveLength(2);
  });

  it("reports a test that the push service did not accept as a failure the person sees", async () => {
    await registerDevice();
    stubPushService(503);
    const context = await withVapid();
    const result = await runWithRequestContext(context, () => sendTest({ adminId: "admin-1", id: "device-1" }, staffNotificationSettings()));
    expect(result).toEqual({ ok: false, reason: "test_failed" });
  });

  it("forgets the device when a test finds it gone", async () => {
    await registerDevice();
    stubPushService(410);
    const context = await withVapid();
    const result = await runWithRequestContext(context, () => sendTest({ adminId: "admin-1", id: "device-1" }, staffNotificationSettings()));
    expect(result).toEqual({ ok: false, reason: "test_failed" });
    expect(await deviceRow()).toBeUndefined();
  });
});
