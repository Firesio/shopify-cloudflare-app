import { env, exports } from "cloudflare:workers";
import { DAILY_CRON, DEVELOPMENT_CRON, DRAIN_ONLY_CRON } from "@firesio/app";
import { installShop, tick } from "@firesio/app/preset/testing";
import { describe, expect, it, vi } from "vitest";
import { identity } from "~/core/identity";
import { UNASSIGNED_CONVERSATION_DAYS } from "~/core/retention";
import { firesio } from "~/firesio.server";
import { setupTestDatabase } from "~/test/database";
import { setupSendRecording } from "~/test/sends";

setupTestDatabase();
const record = setupSendRecording();

// The crons wrangler.jsonc declares: production's two (`env.production.triggers`) and the development one (top level).
const CRONS = { daily: DAILY_CRON, drainOnly: DRAIN_ONLY_CRON, development: DEVELOPMENT_CRON } as const;

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
    await installShop(firesio, env, "cron-e2e.myshopify.com", 1_700_000_000_000);
    expect(await outboxStatus("shop.installed")).toEqual(["pending"]);
    const portal = record(env.PORTAL_EVENTS);

    await tick(exports.default, cron);
    const first = portal.bodies().filter((body) => typesOf([body])[0] === "shop.installed");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ type: "shop.installed", appSlug: identity.slug, account: { kind: "shopify_shop", id: "cron-e2e.myshopify.com" } });
    expect(await outboxStatus("shop.installed")).toEqual(["sent"]);

    // The next tick finds nothing due: the same event is not sent twice.
    await tick(exports.default, cron);
    expect(typesOf(portal.bodies()).filter((type) => type === "shop.installed")).toHaveLength(1);
  });

  it("the daily cron (and the development one) also records the metrics snapshot; the drain-only one does not", async () => {
    await tick(exports.default, CRONS.drainOnly);
    expect(await outboxStatus("metrics.snapshot")).toEqual([]);

    const portal = record(env.PORTAL_EVENTS);
    await tick(exports.default, CRONS.daily);
    expect(await outboxStatus("metrics.snapshot")).toHaveLength(1);
    // It is an outbox row like any event: the next tick, even the drain-only one, sends it.
    await tick(exports.default, CRONS.drainOnly);
    expect(typesOf(portal.bodies())).toContain("metrics.snapshot");
    expect(await outboxStatus("metrics.snapshot")).toEqual(["sent"]);
  });

  it("an unreachable portal queue never fails the tick: the event stays in the outbox for the next one", async () => {
    await installShop(firesio, env, "cron-down.myshopify.com", 1_700_000_000_000);
    const spy = vi.spyOn(env.PORTAL_EVENTS, "send").mockRejectedValue(new Error("queue unavailable"));
    await tick(exports.default, CRONS.drainOnly);
    expect(await outboxStatus("shop.installed")).toEqual(["pending"]);
    spy.mockRestore();
    const portal = record(env.PORTAL_EVENTS);
    // A failed send backs the row off (`next_attempt_at`): let it fall due again, as the minutes between ticks do.
    await env.DB.prepare(`UPDATE portal_outbox SET next_attempt_at = 0`).run();
    await tick(exports.default, CRONS.drainOnly);
    expect(typesOf(portal.bodies())).toEqual(["shop.installed"]);
    expect(await outboxStatus("shop.installed")).toEqual(["sent"]);
  });
});

describe("the daily cron's retention of support conversations no shop owns (retention.unassignedConversationDays)", () => {
  const DAY_MS = 86_400_000;

  async function openStrangerConversation(subject: string): Promise<string> {
    const { inbox } = firesio.services(env);
    if (inbox === null) throw new Error("support is on in this template");
    return (await inbox.submitForm({ name: "Pat", email: "pat@example.org", subject, message: "A question before installing.", shop: null })).ticketId;
  }

  /** The conversation's last activity moved back, as the days between its last message and the tick would. */
  async function age(ticketId: string, days: number, shop: string | null = null): Promise<void> {
    const at = Date.now() - days * DAY_MS;
    await env.DB.prepare(`UPDATE support_tickets SET last_message_at = ?1, created_at = ?1, shop = ?2 WHERE id = ?3`).bind(at, shop, ticketId).run();
  }

  async function remaining(table: "support_tickets" | "support_messages", column: "id" | "ticket_id"): Promise<string[]> {
    const rows = await env.DB.prepare(`SELECT ${column} AS id FROM ${table} ORDER BY ${column}`).all();
    return [...new Set(rows.results.flatMap((row) => (typeof row["id"] === "string" ? [row["id"]] : [])))].sort();
  }

  it("erases one idle past the limit with its messages, and keeps a recent one and an old one a shop owns", async () => {
    const [stale, recent, owned] = [await openStrangerConversation("Old"), await openStrangerConversation("New"), await openStrangerConversation("Owned")];
    await age(stale, UNASSIGNED_CONVERSATION_DAYS + 1);
    await age(recent, UNASSIGNED_CONVERSATION_DAYS - 1);
    await age(owned, UNASSIGNED_CONVERSATION_DAYS + 1, "owner-shop.myshopify.com");

    await tick(exports.default, CRONS.daily);
    expect(await remaining("support_tickets", "id")).toEqual([recent, owned].sort());
    expect(await remaining("support_messages", "ticket_id")).toEqual([recent, owned].sort());
  });
});
