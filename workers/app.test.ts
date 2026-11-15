import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { firesio } from "../app/firesio.server";
import { setupTestDatabase } from "../app/test/database";
import worker from "./app";

setupTestDatabase();

function controller(cron: string): ScheduledController {
  return { cron, scheduledTime: 0, noRetry: () => undefined };
}

describe("the Worker's queue handler", () => {
  it("retries, never acknowledges, a batch addressed to a consumer this Worker does not have", async () => {
    const calls: unknown[] = [];
    const batch = { queue: "some-other-queue", messages: [{}], retryAll: (options: unknown) => void calls.push(options), ackAll: () => void calls.push("ack") };
    // The handler only reads `queue`, `messages.length` and `retryAll`.
    await worker.queue?.(Object.assign(Object.create(null), batch), env);
    expect(calls).toEqual([{ delaySeconds: 60 }]);
  });
});

/** A shop installed the way `afterAuth` records it: the shop row and its `shop.installed` event (one D1 batch), the event waiting in the outbox. */
async function installShop(shop: string, at: number): Promise<void> {
  const { shops, portal } = firesio.services(env);
  const built = await portal.build.shopInstalled({ kind: "shopify_shop", id: shop }, { eventId: `install_${shop.replace(/[^A-Za-z0-9_-]/g, "_")}`, occurredAt: new Date(at) });
  if (!built.ok) throw new Error(`the install event is invalid: ${built.reason}`);
  await shops.recordInstall({ shop, at, event: built.value });
}

describe("the Worker's scheduled handler", () => {
  async function pendingOutbox(): Promise<number> {
    const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM portal_outbox WHERE status = 'pending'`).first();
    return typeof row?.["n"] === "number" ? row["n"] : -1;
  }

  it("drains the outbox into the portal's queue on every tick, the drain-only one included", async () => {
    await installShop("cron-one.myshopify.com", 1_700_000_000_000);
    expect(await pendingOutbox()).toBe(1);
    await worker.scheduled?.(controller("* * * * *"), env);
    expect(await pendingOutbox()).toBe(0);
    const sent = await env.DB.prepare(`SELECT status FROM portal_outbox WHERE type = 'shop.installed'`).first();
    expect(sent?.["status"]).toBe("sent");
  });

  it("sends the daily metrics snapshot on the daily tick and not on the drain-only one", async () => {
    await worker.scheduled?.(controller("* * * * *"), env);
    const none = await env.DB.prepare(`SELECT COUNT(*) AS n FROM portal_outbox WHERE type = 'metrics.snapshot'`).first();
    expect(none?.["n"]).toBe(0);
    await worker.scheduled?.(controller("30 3 * * *"), env);
    const one = await env.DB.prepare(`SELECT COUNT(*) AS n FROM portal_outbox WHERE type = 'metrics.snapshot'`).first();
    expect(one?.["n"]).toBe(1);
  });
});
