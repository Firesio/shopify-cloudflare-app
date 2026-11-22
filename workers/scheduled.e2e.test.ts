import { env, exports } from "cloudflare:workers";
import { DAILY_CRON, DEVELOPMENT_CRON, DRAIN_ONLY_CRON } from "@firesio/app";
import { deliver, installShop, tick } from "@firesio/app/preset/testing";
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

const JOBS_QUEUE = `${identity.slug}-jobs`;

/** The messages of one kind among what a tick put on the jobs queue: a test runs the job it is about and no other (the history backfill is an hourly job of its own). */
const ofKind = (bodies: readonly unknown[], kind: string): unknown[] => bodies.filter((body) => kindsOf([body])[0] === kind);

/** The kinds of the jobs a tick put on the jobs queue (an envelope is `{ v, kind, dedupeKey, payload }`). */
const kindsOf = (bodies: readonly unknown[]): string[] => bodies.flatMap((body) => (typeof body === "object" && body !== null && "kind" in body && typeof body.kind === "string" ? [body.kind] : []));

/**
 * The ids of the events the preset's announce sweep (`shops_announce`, on by default since @firesio/app 1.3.0) makes for shops that were
 * there before the portal was connected. They are the sweep's, not the app's own: the checks below are about the app's own events, so
 * they leave these out (the sweep has its own tests in the package).
 */
const ANNOUNCE_ID = "announce\\_%";

async function outboxStatus(type: string): Promise<string[]> {
  const rows = await env.DB.prepare(`SELECT status FROM portal_outbox WHERE type = ?1 AND event_id NOT LIKE '${ANNOUNCE_ID}' ESCAPE '\\' ORDER BY created_at, event_id`).bind(type).all();
  return rows.results.flatMap((row) => (typeof row["status"] === "string" ? [row["status"]] : []));
}

/** The messages the Worker handed `PORTAL_EVENTS`, as the portal's consumer would read them (the announce sweep's events left out, see ANNOUNCE_ID). */
function ownBodies(bodies: readonly unknown[]): unknown[] {
  return bodies.filter((body) => !(typeof body === "object" && body !== null && "eventId" in body && typeof body.eventId === "string" && body.eventId.startsWith("announce_")));
}

function typesOf(bodies: readonly unknown[]): string[] {
  return ownBodies(bodies).flatMap((body) => (typeof body === "object" && body !== null && "type" in body && typeof body.type === "string" ? [body.type] : []));
}

describe("the Worker's scheduled handler, called through exports.default.scheduled", () => {
  it.each(Object.entries(CRONS))("the %s cron (%s) drains a waiting event into PORTAL_EVENTS, once", async (_name, cron) => {
    // A tick puts jobs on the jobs queue; Miniflare would hand them to the Worker on its own clock, in the middle of a later test. Capture them: a test runs a job by delivering it itself.
    record(env.JOBS_QUEUE);
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

  it("an unreachable portal queue never fails the tick: the event stays in the outbox for the next one", async () => {
    record(env.JOBS_QUEUE);
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

describe("the cron only triggers: the work is a job on the jobs queue", () => {
  it("the daily cron only TRIGGERS the metrics snapshot (a job on the jobs queue); the drain-only one enqueues none; the job records the snapshot once", async () => {
    const jobs = record(env.JOBS_QUEUE);
    await tick(exports.default, CRONS.drainOnly);
    expect(kindsOf(jobs.bodies())).not.toContain("metrics_snapshot");
    expect(await outboxStatus("metrics.snapshot")).toEqual([]);

    const portal = record(env.PORTAL_EVENTS);
    await tick(exports.default, CRONS.daily);
    expect(kindsOf(jobs.bodies())).toContain("metrics_snapshot");
    expect(await outboxStatus("metrics.snapshot")).toEqual([]);
    // The queue delivers the message to the Worker's queue handler: the job is claimed, runs, and the snapshot is an outbox row like any event.
    const snapshot = ofKind(jobs.bodies(), "metrics_snapshot");
    expect(snapshot).toHaveLength(1);
    expect(await deliver(exports.default, JOBS_QUEUE, snapshot)).toMatchObject({ retried: [], retriedAll: 0 });
    expect(await outboxStatus("metrics.snapshot")).toHaveLength(1);
    // The same message delivered again runs nothing twice: the claim says the job is done.
    await deliver(exports.default, JOBS_QUEUE, snapshot);
    expect(await outboxStatus("metrics.snapshot")).toHaveLength(1);
    // It is an outbox row like any event: the next tick, even the drain-only one, sends it.
    await tick(exports.default, CRONS.drainOnly);
    expect(typesOf(portal.bodies())).toContain("metrics.snapshot");
    expect(await outboxStatus("metrics.snapshot")).toEqual(["sent"]);
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
  async function age(conversationId: string, days: number, shop: string | null = null): Promise<void> {
    const at = Date.now() - days * DAY_MS;
    await env.DB.batch([
      env.DB.prepare(`UPDATE conversations SET last_message_at = ?1, created_at = ?1, shop = ?2 WHERE id = ?3`).bind(at, shop, conversationId),
      env.DB.prepare(`UPDATE conversation_messages SET created_at = ?1 WHERE conversation_id = ?2`).bind(at, conversationId),
    ]);
  }

  async function remaining(table: "conversations" | "conversation_messages", column: "id" | "conversation_id"): Promise<string[]> {
    const rows = await env.DB.prepare(`SELECT ${column} AS id FROM ${table} ORDER BY ${column}`).all();
    return [...new Set(rows.results.flatMap((row) => (typeof row["id"] === "string" ? [row["id"]] : [])))].sort();
  }

  it("erases one idle past the limit with its messages, and keeps a recent one and an old one a shop owns", async () => {
    const [stale, recent, owned] = [await openStrangerConversation("Old"), await openStrangerConversation("New"), await openStrangerConversation("Owned")];
    await age(stale, UNASSIGNED_CONVERSATION_DAYS + 1);
    await age(recent, UNASSIGNED_CONVERSATION_DAYS - 1);
    await age(owned, UNASSIGNED_CONVERSATION_DAYS + 1, "owner-shop.myshopify.com");

    // The daily cron enqueues the `prune` job; the queue handler runs it.
    const jobs = record(env.JOBS_QUEUE);
    await tick(exports.default, CRONS.daily);
    await deliver(exports.default, JOBS_QUEUE, ofKind(jobs.bodies(), "prune"));
    expect(await remaining("conversations", "id")).toEqual([recent, owned].sort());
    expect(await remaining("conversation_messages", "conversation_id")).toEqual([recent, owned].sort());
  });
});
