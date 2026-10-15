import type { ImmediateNotifier } from "~/ports/notifier";

export interface TestPushDeps {
  readonly notifier: ImmediateNotifier;
  readonly newId: () => string;
}

/**
 * Sends one test message to one device and answers how many the push service accepted (0 or 1).
 *
 * It is a real notification, `push_test`, through the same channel as every other push: the device is looked up by its
 * id, a device the push service says is gone is forgotten, an unknown or switched-off one is refused, and the attempt
 * leaves a row in the notification history. The copy is fixed — a test carries no data — and a fresh dedupe key makes
 * every press send.
 */
export async function sendTestPush(deviceId: string, deps: TestPushDeps): Promise<number> {
  const result = await deps.notifier.sendNow({
    event: "push_test",
    to: { push: deviceId },
    dedupeKey: `push-test:${deps.newId()}`,
    payload: { recipientName: "Staff" },
  });
  return result.delivered;
}
