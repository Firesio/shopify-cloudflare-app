import { describe, expect, it } from "vitest";
import { createQueuedNotifier } from "./notification-enqueue";
import { fakeNotificationQueue } from "~/test/fake-notification-queue";
import type { NotifyRequest } from "~/ports/notifier";

const request: NotifyRequest<"admin_password_reset"> = {
  event: "admin_password_reset",
  to: { email: "ops@workmanjsc.vn" },
  payload: { recipientName: "Ops", resetUrl: "https://app.workmanjsc.vn/r/t", expiresIn: "one hour" },
};

function setup() {
  const queue = fakeNotificationQueue();
  const settled: unknown[] = [];
  const logged: unknown[] = [];
  let sequence = 0;
  const notifier = createQueuedNotifier({
    queue,
    logs: { recordSettled: async (row) => { settled.push(row); } },
    newId: () => `id-${(sequence += 1)}`,
    now: () => 1000,
    log: (entry) => { logged.push(entry); },
  });
  return { queue, notifier, settled, logged };
}

describe("queued notifier", () => {
  it("enqueues exactly one message per send", async () => {
    const { queue, notifier } = setup();
    await notifier.send(request);
    expect(queue.enqueued).toHaveLength(1);
    expect(queue.enqueued[0]?.event).toBe("admin_password_reset");
  });

  it("mints a dedupe key when the caller gave none", async () => {
    const { queue, notifier } = setup();
    await notifier.send(request);
    expect(queue.enqueued[0]?.dedupeKey).toBe("admin_password_reset:id-1");
  });

  it("keeps the caller's dedupe key and log id", async () => {
    const { queue, notifier } = setup();
    await notifier.send({ ...request, dedupeKey: "mine", logId: "log-9" });
    expect(queue.enqueued[0]).toMatchObject({ dedupeKey: "mine", logId: "log-9" });
  });

  it("does not throw when the queue is down, and leaves a failed row and an event", async () => {
    const { queue, notifier, settled, logged } = setup();
    queue.failWith(new Error("queue unavailable for ops@workmanjsc.vn"));
    await expect(notifier.send(request)).resolves.toBeUndefined();
    expect(settled).toEqual([expect.objectContaining({
      event: "admin_password_reset",
      channel: "email",
      recipient: "ops@workmanjsc.vn",
      status: "failed",
      reasonCode: "transport_error",
    })]);
    expect(logged).toEqual([{ event: "notification.enqueue_failed", notification: "admin_password_reset", reason: "Error" }]);
    // Neither the address nor the error text reaches the structured event.
    expect(JSON.stringify(logged)).not.toContain("workmanjsc");
  });

  it("does not throw when recording the failure fails as well", async () => {
    const queue = fakeNotificationQueue();
    queue.failWith(new Error("down"));
    const logged: unknown[] = [];
    const notifier = createQueuedNotifier({
      queue,
      logs: { recordSettled: async () => { throw new Error("db down"); } },
      newId: () => "id",
      now: () => 1,
      log: (entry) => { logged.push(entry); },
    });
    await expect(notifier.send(request)).resolves.toBeUndefined();
    expect(logged).toHaveLength(2);
  });

  it("records a failed row for a push that could not be queued, naming the device by id", async () => {
    const { queue, notifier, settled, logged } = setup();
    queue.failWith(new Error("queue unavailable"));
    await expect(notifier.send({
      event: "push_test",
      to: { push: "subscription-id-1" },
      payload: { recipientName: "Staff" },
    })).resolves.toBeUndefined();
    expect(settled).toEqual([expect.objectContaining({
      event: "push_test",
      channel: "push",
      recipient: "subscription-id-1",
      status: "failed",
      reasonCode: "transport_error",
    })]);
    expect(logged).toEqual([{ event: "notification.enqueue_failed", notification: "push_test", reason: "Error" }]);
  });

  it("records one failed row per addressed channel", async () => {
    const { queue, notifier, settled } = setup();
    queue.failWith(new Error("down"));
    await notifier.send({
      event: "shop_installed",
      to: { email: "staff@workmanjsc.vn", push: "d1" },
      payload: { recipientName: "S", shopName: "A", shop: "a.myshopify.com", occurredAt: "x", adminUrl: "https://app.workmanjsc.vn/internal/shops/a" },
    });
    expect(settled.map((row) => row)).toEqual([
      expect.objectContaining({ channel: "email", recipient: "staff@workmanjsc.vn" }),
      expect.objectContaining({ channel: "push", recipient: "d1" }),
    ]);
  });
});
