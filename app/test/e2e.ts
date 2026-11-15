import { env, exports } from "cloudflare:workers";
import { vi, expect } from "vitest";
import { firesio } from "~/firesio.server";

/** A shop installed the way `afterAuth` records it: the shop row and its `shop.installed` event (one D1 batch), the event waiting in the outbox. */
export async function installShop(shop: string, at: number): Promise<void> {
  const { shops, portal } = firesio.services(env);
  const built = await portal.build.shopInstalled({ kind: "shopify_shop", id: shop }, { eventId: `install_${shop.replace(/[^A-Za-z0-9_-]/g, "_")}`, occurredAt: new Date(at) });
  if (!built.ok) throw new Error(`the install event is invalid: ${built.reason}`);
  await shops.recordInstall({ shop, at, event: built.value });
}

/**
 * Captures what the Worker puts on `queue`: its message bodies, exactly as the producer binding was handed them. The messages are NOT
 * forwarded: Miniflare delivers a message of a queue that has a consumer in wrangler.jsonc to the Worker's `queue` handler a few
 * seconds later, on its own clock, which would apply the same webhook behind a later test's back. The test hands the captured bodies
 * to the handler itself (`deliver`), so the delivery happens exactly when and as often as the test says. Pair with
 * `afterEach(() => vi.restoreAllMocks())`.
 */
export function recordSends(queue: Queue): { readonly bodies: () => unknown[] } {
  const bodies: unknown[] = [];
  const metrics = { backlogCount: 0, backlogBytes: 0 };
  vi.spyOn(queue, "send").mockImplementation(async (body) => {
    bodies.push(body);
    return { metadata: { metrics } };
  });
  vi.spyOn(queue, "sendBatch").mockImplementation(async (messages) => {
    for (const message of messages) bodies.push(message.body);
    return { metadata: { metrics } };
  });
  return { bodies: () => [...bodies] };
}

/**
 * Calls a handler of the Worker's real default export (`exports.default`). The plugin serves `queue` and `scheduled` as RPC methods the
 * generated `exports` type does not list, so the method is looked up by name and checked, never cast.
 */
export async function callHandler(name: "queue" | "scheduled", argument: object): Promise<void> {
  const method: unknown = Reflect.get(exports.default, name);
  if (typeof method !== "function") throw new Error(`exports.default has no ${name}() handler`);
  await Reflect.apply(method, exports.default, [argument]);
}

/** One cron tick, delivered to the Worker's `scheduled` handler the way the Cloudflare cron trigger does. */
export const tick = (cron: string): Promise<void> => callHandler("scheduled", { cron, scheduledTime: Date.now(), noRetry: () => undefined });

/** What the queue handler did with each message: the Worker is handed a batch by RPC, so the acknowledgements arrive as calls back. */
export interface Settlement {
  readonly acked: string[];
  readonly retried: string[];
  readonly retriedAll: number;
}

/**
 * Delivers `bodies` to the Worker's REAL `queue` handler (`exports.default.queue`) as one batch on `queueName`, and waits until every
 * message is acknowledged or retried. `exports.default.queue(name, messages)` of workerd's Fetcher is NOT what the plugin provides
 * (the handler would get the name string as its batch), so the batch is a plain object whose `ack`/`retry` call back into the test.
 */
export async function deliver(queueName: string, bodies: readonly unknown[]): Promise<Settlement> {
  const acked: string[] = [];
  const retried: string[] = [];
  let retriedAll = 0;
  const messages = bodies.map((body, index) => ({ id: `msg-${index}`, timestamp: new Date(), attempts: 1, body, ack: () => void acked.push(`msg-${index}`), retry: () => void retried.push(`msg-${index}`) }));
  await callHandler("queue", { queue: queueName, messages, ackAll: () => undefined, retryAll: () => void (retriedAll += 1) });
  await vi.waitFor(() => expect(acked.length + retried.length + retriedAll).toBeGreaterThan(0));
  return { acked, retried, retriedAll };
}
