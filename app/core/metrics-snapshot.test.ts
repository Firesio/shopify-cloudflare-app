import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { setupTestDatabase } from "~/test/database";
import { createServices } from "~/wiring/services";
import { mrrOf, sendDailySnapshot } from "./metrics-snapshot";

setupTestDatabase();

const NOW = Date.parse("2026-11-15T03:30:00Z");

describe("mrrOf", () => {
  it("multiplies paying shops by the plan's monthly price, per currency, and ignores the free plan and unknown handles", () => {
    expect(mrrOf({ pro: 3, free: 9, retired: 2 })).toEqual([{ amount: 5_700, currency: "USD" }]);
    expect(mrrOf({})).toEqual([]);
  });
});

describe("the daily snapshot", () => {
  it("describes yesterday in aggregates only and queues one metrics.snapshot with a stable id", async () => {
    await env.DB.prepare(`INSERT INTO shops (shop, installed_at, relationship_status) VALUES ('snap.myshopify.com', ?1, 'INSTALLED')`).bind(Date.parse("2026-11-14T05:00:00Z")).run();
    const s = createServices(env);
    expect(await sendDailySnapshot({ metrics: s.metrics, portal: s.portal, log: s.log }, NOW)).toBe("sent");
    expect(await sendDailySnapshot({ metrics: s.metrics, portal: s.portal, log: s.log }, NOW)).toBe("sent");
    const rows = await env.DB.prepare(`SELECT event_id, payload FROM portal_outbox WHERE type = 'metrics.snapshot'`).all();
    expect(rows.results).toHaveLength(1);
    const payload = String(rows.results[0]?.["payload"]);
    expect(rows.results[0]?.["event_id"]).toBe("metrics_2026-11-14");
    expect(payload).toContain('"shops.installed":1');
    expect(payload).not.toContain("snap.myshopify.com");
  });
});
