import { drizzle } from "drizzle-orm/d1";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  aiRuns,
  mcpAuditLogs,
  notificationLogs,
  staffAuditLogs,
  webhookDeliveries,
  webhookScopeObservations,
} from "~/db/schema";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { RetentionRepo } from "./retention.server";

setupTestDatabase();

const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);
const CUTOFF = 1_000_000;

type DeliveryStatus = "received" | "queued" | "processing" | "processed" | "failed" | "dead_letter";
const delivery = (id: string, status: DeliveryStatus, receivedAt: number) => ({
  id, eventId: `event-${id}`, topic: "app/scopes_update", apiVersion: "2026-10", shop: "a.myshopify.com",
  triggeredAt: receivedAt, receivedAt, payloadHash: "hash", status,
});

const ids = async (rows: Promise<{ id: string }[]>) => (await rows).map(({ id }) => id).sort();

describe("RetentionRepo", () => {
  it("deletes only rows strictly older than the cutoff", async () => {
    await db.insert(notificationLogs).values([
      { id: "old", event: "x", channel: "email", recipient: "a@b.c", status: "sent", createdAt: CUTOFF - 1 },
      { id: "edge", event: "x", channel: "email", recipient: "a@b.c", status: "sent", createdAt: CUTOFF },
      { id: "new", event: "x", channel: "email", recipient: "a@b.c", status: "queued", createdAt: CUTOFF + 1 },
    ]);
    const deleted = await inRequest(() => new RetentionRepo().prune("notification_logs", CUTOFF, 500));
    expect(deleted).toBe(1);
    expect(await ids(db.select({ id: notificationLogs.id }).from(notificationLogs))).toEqual(["edge", "new"]);
  });

  it("deletes at most `limit` rows, oldest first", async () => {
    await db.insert(staffAuditLogs).values([1, 2, 3, 4].map((n) => ({ id: `s${n}`, actorEmail: "x@y.z", kind: "access" as const, createdAt: n })));
    const deleted = await inRequest(() => new RetentionRepo().prune("staff_audit_logs", CUTOFF, 3));
    expect(deleted).toBe(3);
    expect(await ids(db.select({ id: staffAuditLogs.id }).from(staffAuditLogs))).toEqual(["s4"]);
  });

  it("prunes ai_runs and mcp_audit_logs by age", async () => {
    await db.insert(aiRuns).values([
      { id: "a-old", role: "writing", modelId: "m", feature: "f", status: "ok", createdAt: 1 },
      { id: "a-new", role: "writing", modelId: "m", feature: "f", status: "ok", createdAt: CUTOFF + 1 },
    ]);
    await db.insert(mcpAuditLogs).values([
      { id: "m-old", actorEmail: "x@y.z", actorType: "staff_pat", toolName: "t", isMutation: false, ok: true, latencyMs: 1, createdAt: 1 },
      { id: "m-new", actorEmail: "x@y.z", actorType: "staff_pat", toolName: "t", isMutation: false, ok: true, latencyMs: 1, createdAt: CUTOFF + 1 },
    ]);
    const repo = new RetentionRepo();
    expect(await inRequest(() => repo.prune("ai_runs", CUTOFF, 500))).toBe(1);
    expect(await inRequest(() => repo.prune("mcp_audit_logs", CUTOFF, 500))).toBe(1);
    expect(await ids(db.select({ id: aiRuns.id }).from(aiRuns))).toEqual(["a-new"]);
    expect(await ids(db.select({ id: mcpAuditLogs.id }).from(mcpAuditLogs))).toEqual(["m-new"]);
  });

  it("removes old settled deliveries with their scope observations, and never an in-flight one", async () => {
    await db.insert(webhookDeliveries).values([
      delivery("processed-old", "processed", 1),
      delivery("processed-new", "processed", CUTOFF + 1),
      delivery("dead-old", "dead_letter", 1),
      delivery("failed-old", "failed", 1),
      delivery("received-old", "received", 1),
      delivery("queued-old", "queued", 1),
      delivery("processing-old", "processing", 1),
    ]);
    await db.insert(webhookScopeObservations).values([
      { deliveryId: "processed-old", shop: "a.myshopify.com", scope: "read_products" },
      { deliveryId: "processed-new", shop: "a.myshopify.com", scope: "read_products" },
    ]);
    const repo = new RetentionRepo();

    expect(await inRequest(() => repo.prune("webhook_deliveries_processed", CUTOFF, 500))).toBe(1);
    expect(await inRequest(() => repo.prune("webhook_deliveries_failed", CUTOFF, 500))).toBe(2);

    expect(await ids(db.select({ id: webhookDeliveries.id }).from(webhookDeliveries))).toEqual(
      ["processed-new", "processing-old", "queued-old", "received-old"],
    );
    const observations = await db.select({ deliveryId: webhookScopeObservations.deliveryId }).from(webhookScopeObservations);
    expect(observations.map(({ deliveryId }) => deliveryId)).toEqual(["processed-new"]);
  });
});
