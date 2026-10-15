import { describe, expect, it } from "vitest";
import type { ImmediateNotifier, NotifyRequest } from "~/ports/notifier";
import { sendTestPush } from "./test-push";

/** Records what it was asked to send and answers with a fixed delivery count. */
function fakeImmediateNotifier(delivered: number) {
  const requests: NotifyRequest[] = [];
  const notifier: ImmediateNotifier = {
    async sendNow(input) {
      requests.push(input);
      return { delivered };
    },
  };
  return { notifier, requests };
}

function ids() {
  let next = 0;
  return () => `id-${(next += 1)}`;
}

describe("sendTestPush", () => {
  it("asks for one push_test notification to the device, by its id", async () => {
    const { notifier, requests } = fakeImmediateNotifier(1);
    expect(await sendTestPush("d1", { notifier, newId: ids() })).toBe(1);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ event: "push_test", to: { push: "d1" } });
    // Only the device's id travels: never an endpoint or a key.
    expect(JSON.stringify(requests[0])).not.toMatch(/https?:/);
  });

  it("answers how many deliveries the channel accepted", async () => {
    expect(await sendTestPush("d1", { notifier: fakeImmediateNotifier(0).notifier, newId: ids() })).toBe(0);
  });

  it("uses a fresh dedupe key each time, so pressing the button again sends again", async () => {
    const { notifier, requests } = fakeImmediateNotifier(1);
    const newId = ids();
    await sendTestPush("d1", { notifier, newId });
    await sendTestPush("d1", { notifier, newId });
    expect(requests.map((request) => request.dedupeKey)).toEqual(["push-test:id-1", "push-test:id-2"]);
  });
});
