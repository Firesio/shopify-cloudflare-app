import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { identity } from "~/core/identity";
import { setupTestDatabase } from "~/test/database";
import { installShop, recordSends, tick } from "~/test/e2e";

setupTestDatabase();
afterEach(() => vi.restoreAllMocks());

// The crons wrangler.jsonc declares: production's two (`env.production.triggers`) and the development one (top level).
const CRONS = { daily: "30 3 * * *", drainOnly: "* * * * *", development: "*/5 * * * *" } as const;

async function outboxStatus(type: string): Promise<string[]> {
  const rows = await env.DB.prepare(`SELECT status FROM portal_outbox WHERE type = ?1 ORDER BY created_at, event_id`).bind(type).all();
  return rows.results.flatMap((row) => (typeof row["status"] === "string" ? [row["status"]] : []));
}

/** The messages the Worker handed `PORTAL_EVENTS`, as the portal's consumer would read them. */
function typesOf(bodies: readonly unknown[]): string[] {
  return bodies.flatMap((body) => (typeof body === "object" && body !== null && "type" in body && typeof body.type === "string" ? [body.type] : []));
}

describe("the Worker's scheduled handler, called through exports.default.scheduled", () => {
  it.each(Object.entries(CRONS))("the %s cron (%s) drains a waiting event into PORTAL_EVENTS, once", async (_name, cron) => {
    await installShop("cron-e2e.myshopify.com", 1_700_000_000_000);
    expect(await outboxStatus("shop.installed")).toEqual(["pending"]);
    const portal = recordSends(env.PORTAL_EVENTS);

    await tick(cron);
    const first = portal.bodies().filter((body) => typesOf([body])[0] === "shop.installed");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ type: "shop.installed", appSlug: identity.slug, account: { kind: "shopify_shop", id: "cron-e2e.myshopify.com" } });
    expect(await outboxStatus("shop.installed")).toEqual(["sent"]);

    // The next tick finds nothing due: the same event is not sent twice.
    await tick(cron);
    expect(typesOf(portal.bodies()).filter((type) => type === "shop.installed")).toHaveLength(1);
  });

  it("the daily cron (and the development one) also records the metrics snapshot; the drain-only one does not", async () => {
    await tick(CRONS.drainOnly);
    expect(await outboxStatus("metrics.snapshot")).toEqual([]);

    const portal = recordSends(env.PORTAL_EVENTS);
    await tick(CRONS.daily);
    expect(await outboxStatus("metrics.snapshot")).toHaveLength(1);
    // It is an outbox row like any event: the next tick, even the drain-only one, sends it.
    await tick(CRONS.drainOnly);
    expect(typesOf(portal.bodies())).toContain("metrics.snapshot");
    expect(await outboxStatus("metrics.snapshot")).toEqual(["sent"]);
  });

  it("an unreachable portal queue never fails the tick: the event stays in the outbox for the next one", async () => {
    await installShop("cron-down.myshopify.com", 1_700_000_000_000);
    vi.spyOn(env.PORTAL_EVENTS, "send").mockRejectedValue(new Error("queue unavailable"));
    await tick(CRONS.drainOnly);
    expect(await outboxStatus("shop.installed")).toEqual(["pending"]);
    vi.restoreAllMocks();
    const portal = recordSends(env.PORTAL_EVENTS);
    // A failed send backs the row off (`next_attempt_at`): let it fall due again, as the minutes between ticks do.
    await env.DB.prepare(`UPDATE portal_outbox SET next_attempt_at = 0`).run();
    await tick(CRONS.drainOnly);
    expect(typesOf(portal.bodies())).toEqual(["shop.installed"]);
    expect(await outboxStatus("shop.installed")).toEqual(["sent"]);
  });
});
