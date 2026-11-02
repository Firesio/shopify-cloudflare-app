import { and, asc, desc, eq, exists, isNull, lt, or, sql } from "drizzle-orm";
import { campaignRecipients, campaigns, shops, type CampaignRow } from "~/db/schema";
import { isCampaignStatus, type CampaignContent, type CampaignStatus } from "~/domain/campaign";
import { isPauseReason, EMPTY_COUNTS, type RecipientCounts } from "~/domain/campaign-delivery";
import type { AudienceFilter } from "~/domain/campaign-audience";
import { receivers, shopAddress } from "./campaign-audience.server";
import type {
  Campaign,
  CampaignRecipient,
  CampaignStore,
  CampaignSummary,
  RecipientStatus,
  SettledStatus,
} from "~/ports/campaigns";
import { parseStoredAudience } from "~/schemas/campaign";
import { getDb } from "~/request-context.server";

/** A stored status the code no longer knows reads as `cancelled`: final, and never sends anything again. */
function statusOf(value: string): CampaignStatus {
  return isCampaignStatus(value) ? value : "cancelled";
}

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    body: row.body,
    ctaLabel: row.ctaLabel,
    ctaUrl: row.ctaUrl,
    audience: parseStoredAudience(row.audience),
    status: statusOf(row.status),
    pauseReason: row.pauseReason !== null && isPauseReason(row.pauseReason) ? row.pauseReason : null,
    recipientCount: row.recipientCount,
    createdBy: row.createdBy,
    createdByEmail: row.createdByEmail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    lastPumpAt: row.lastPumpAt,
  };
}

/**
 * The ONLY place `campaigns` and `campaign_recipients` are queried.
 *
 * `campaigns` is not shop-scoped (it is the team's, like `admin_users`); every `campaign_recipients` query is scoped by
 * campaign id, and the ones that touch one recipient also by shop.
 */
export class CampaignRepo implements CampaignStore {
  async create(input: { id: string; content: CampaignContent; audience: AudienceFilter; createdBy: string | null; createdByEmail: string; now: number }): Promise<Campaign> {
    const [row] = await getDb()
      .insert(campaigns)
      .values({
        id: input.id,
        name: input.content.name,
        subject: input.content.subject,
        body: input.content.body,
        ctaLabel: input.content.ctaLabel,
        ctaUrl: input.content.ctaUrl,
        audience: JSON.stringify(input.audience),
        createdBy: input.createdBy,
        createdByEmail: input.createdByEmail,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning();
    if (!row) throw new Error("campaign insert returned no row");
    return toCampaign(row);
  }

  async updateDraft(id: string, content: CampaignContent, audience: AudienceFilter, now: number): Promise<boolean> {
    const updated = await getDb()
      .update(campaigns)
      .set({
        name: content.name,
        subject: content.subject,
        body: content.body,
        ctaLabel: content.ctaLabel,
        ctaUrl: content.ctaUrl,
        audience: JSON.stringify(audience),
        updatedAt: now,
      })
      .where(and(eq(campaigns.id, id), eq(campaigns.status, "draft")))
      .returning({ id: campaigns.id });
    return updated.length > 0;
  }

  async deleteDraft(id: string): Promise<boolean> {
    const deleted = await getDb()
      .delete(campaigns)
      .where(and(eq(campaigns.id, id), eq(campaigns.status, "draft")))
      .returning({ id: campaigns.id });
    return deleted.length > 0;
  }

  async find(id: string): Promise<Campaign | undefined> {
    const row = await getDb().select().from(campaigns).where(eq(campaigns.id, id)).get();
    return row === undefined ? undefined : toCampaign(row);
  }

  async list(limit: number): Promise<readonly CampaignSummary[]> {
    const rows = await getDb()
      .select({
        id: campaigns.id,
        name: campaigns.name,
        subject: campaigns.subject,
        status: campaigns.status,
        pauseReason: campaigns.pauseReason,
        recipientCount: campaigns.recipientCount,
        createdByEmail: campaigns.createdByEmail,
        createdAt: campaigns.createdAt,
        startedAt: campaigns.startedAt,
        completedAt: campaigns.completedAt,
      })
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt), desc(campaigns.id))
      .limit(limit);
    return rows.map((row) => ({ ...row, status: statusOf(row.status), pauseReason: row.pauseReason !== null && isPauseReason(row.pauseReason) ? row.pauseReason : null }));
  }

  async transition(input: { id: string; from: CampaignStatus; to: CampaignStatus; now: number; pauseReason?: Campaign["pauseReason"] }): Promise<boolean> {
    const finished = input.to === "sent" || input.to === "cancelled";
    const updated = await getDb()
      .update(campaigns)
      .set({
        status: input.to,
        updatedAt: input.now,
        // Only a pause sets a reason; every other move clears it.
        pauseReason: input.to === "paused" ? (input.pauseReason ?? null) : null,
        ...(finished ? { completedAt: input.now } : {}),
      })
      .where(and(eq(campaigns.id, input.id), eq(campaigns.status, input.from)))
      .returning({ id: campaigns.id });
    return updated.length > 0;
  }

  async start(input: { id: string; audience: AudienceFilter; version: number; now: number }): Promise<number | undefined> {
    const { id, now } = input;
    const db = getDb();
    // The recipients are written only while the campaign is `sending` AND has no count yet: that is true in the batch
    // that started it and never again, so a second start (or a retry) cannot add anyone who installed since.
    const starting = exists(
      db
        .select({ one: sql`1` })
        .from(campaigns)
        .where(and(eq(campaigns.id, id), eq(campaigns.status, "sending"), isNull(campaigns.recipientCount))),
    );
    // ONE batch is one transaction: the move to `sending` and the recipient list stand or fall together, so a campaign
    // is never `sending` with nobody to send to, and a second start finds the first one's recipients already there.
    const [moved] = await db.batch([
      db
        .update(campaigns)
        .set({ status: "sending", startedAt: now, updatedAt: now, pauseReason: null })
        .where(and(eq(campaigns.id, id), eq(campaigns.status, "draft"), eq(campaigns.updatedAt, input.version))),
      db
        .insert(campaignRecipients)
        .select(
          db
            .select({
              campaignId: sql<string>`${id}`.as("campaign_id"),
              shop: shops.shop,
              shopName: sql<string>`coalesce(${shops.name}, ${shops.shop})`.as("shop_name"),
              email: sql<string>`${shopAddress}`.as("email"),
              status: sql<"pending">`'pending'`.as("status"),
              reasonCode: sql<string | null>`null`.as("reason_code"),
              attempts: sql<number>`0`.as("attempts"),
              settledAt: sql<number | null>`null`.as("settled_at"),
            })
            .from(shops)
            .where(and(starting, receivers(input.audience))),
        )
        .onConflictDoNothing(),
      db
        .update(campaigns)
        .set({
          recipientCount: sql`(select count(*) from ${campaignRecipients} where ${campaignRecipients.campaignId} = ${id})`,
        })
        .where(and(eq(campaigns.id, id), eq(campaigns.status, "sending"), isNull(campaigns.recipientCount))),
    ]);
    if (moved.meta.changes === 0) return undefined;
    const row = await db.select({ n: campaigns.recipientCount }).from(campaigns).where(eq(campaigns.id, id)).get();
    return row?.n ?? 0;
  }

  async counts(id: string): Promise<RecipientCounts> {
    const rows = await getDb()
      .select({ status: campaignRecipients.status, n: sql<number>`count(*)` })
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, id))
      .groupBy(campaignRecipients.status);
    const counts = { ...EMPTY_COUNTS };
    for (const row of rows) counts[row.status] = Number(row.n);
    return counts;
  }

  async recipients(id: string, input: { status?: RecipientStatus; limit: number }): Promise<readonly CampaignRecipient[]> {
    return getDb()
      .select()
      .from(campaignRecipients)
      .where(and(eq(campaignRecipients.campaignId, id), input.status === undefined ? undefined : eq(campaignRecipients.status, input.status)))
      .orderBy(asc(campaignRecipients.shop))
      .limit(input.limit);
  }

  async nextPending(id: string, limit: number): Promise<readonly CampaignRecipient[]> {
    return getDb()
      .select()
      .from(campaignRecipients)
      .where(and(eq(campaignRecipients.campaignId, id), eq(campaignRecipients.status, "pending")))
      .orderBy(asc(campaignRecipients.attempts), asc(campaignRecipients.shop))
      .limit(limit);
  }

  async settle(id: string, shop: string, status: SettledStatus, reasonCode: string | null, now: number): Promise<void> {
    await getDb()
      .update(campaignRecipients)
      .set({ status, reasonCode, settledAt: now })
      .where(and(eq(campaignRecipients.campaignId, id), eq(campaignRecipients.shop, shop), eq(campaignRecipients.status, "pending")));
  }

  async recordAttempt(id: string, shop: string): Promise<void> {
    await getDb()
      .update(campaignRecipients)
      .set({ attempts: sql`${campaignRecipients.attempts} + 1` })
      .where(and(eq(campaignRecipients.campaignId, id), eq(campaignRecipients.shop, shop), eq(campaignRecipients.status, "pending")));
  }

  async skipPending(id: string, now: number): Promise<number> {
    const skipped = await getDb()
      .update(campaignRecipients)
      .set({ status: "skipped", reasonCode: "cancelled", settledAt: now })
      .where(and(eq(campaignRecipients.campaignId, id), eq(campaignRecipients.status, "pending")))
      .returning({ shop: campaignRecipients.shop });
    return skipped.length;
  }

  async recordPump(id: string, now: number): Promise<void> {
    await getDb().update(campaigns).set({ lastPumpAt: now }).where(eq(campaigns.id, id));
  }

  async stalled(quietBefore: number, limit: number): Promise<readonly string[]> {
    const rows = await getDb()
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.status, "sending"),
          // A chain that never ran (no pump yet) is quiet since it started.
          or(lt(campaigns.lastPumpAt, quietBefore), and(isNull(campaigns.lastPumpAt), lt(campaigns.startedAt, quietBefore))),
        ),
      )
      .orderBy(asc(campaigns.startedAt))
      .limit(limit);
    return rows.map((row) => row.id);
  }
}
