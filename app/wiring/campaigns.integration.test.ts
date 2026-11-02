import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { campaignRecipients, notificationLogs, shops } from "~/db/schema";
import { DEFAULT_AUDIENCE } from "~/domain/campaign-audience";
import { verifyUnsubscribeToken } from "~/lib/unsubscribe-token";
import { runWithRequestContext } from "~/request-context.server";
import { handleCampaignBatch } from "~/services/campaign-queue";
import { createDraft } from "~/services/campaigns/draft-campaign";
import { startCampaign } from "~/services/campaigns/start-campaign";
import { setupTestDatabase } from "~/test/db";
import { campaignConsumerDependencies, campaignDependencies } from "./campaigns.server";

setupTestDatabase();

const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);
const ACTOR = { id: null, email: "staff@firesio.app" } as const;

describe("campaigns, wired for real", () => {
  it("builds an unsubscribe link on the app's own origin that only we could have signed, for the address it names", async () => {
    await inRequest(async () => {
      const link = await campaignDependencies().unsubscribeUrl("Owner@Firesio.app");
      expect(link.startsWith("https://example.test/unsubscribe/")).toBe(true);
      const token = decodeURIComponent(link.slice("https://example.test/unsubscribe/".length));
      expect(await verifyUnsubscribeToken({ secret: "test-attachment-secret", token })).toBe("owner@firesio.app");
      expect(await verifyUnsubscribeToken({ secret: "another-secret", token })).toBeUndefined();
    });
  });

  it("runs a queued delivery step through the real store and the one notification pipeline, and stops when no mail channel is set up", async () => {
    await inRequest(async () => {
      await db.insert(shops).values({ shop: "alpha.myshopify.com", name: "Alpha", email: "owner@firesio.app", installedAt: 1 });
      const deps = campaignDependencies();
      const created = await createDraft(ACTOR, { name: "n", subject: "s", body: "b", ctaLabel: "", ctaUrl: "", audience: DEFAULT_AUDIENCE }, deps);
      if (!created.ok) throw new Error("draft refused");
      expect(await startCampaign(ACTOR, { id: created.campaign.id, expectedRecipients: 1 }, deps)).toEqual({ ok: true, recipients: 1 });

      const events: string[] = [];
      await handleCampaignBatch(
        { messages: [{ body: { campaignId: created.campaign.id }, attempts: 1, ack: () => events.push("ack"), retry: () => events.push("retry") }] },
        { ...campaignConsumerDependencies(), log: () => undefined },
      );

      // The test environment has no sender configured: the step is acknowledged, the campaign waits for a person,
      // and nobody was recorded as failed or sent.
      expect(events).toEqual(["ack"]);
      expect(await deps.store.find(created.campaign.id)).toMatchObject({ status: "paused", pauseReason: "channel_unavailable" });
      const rows = await db.select().from(campaignRecipients).all();
      expect(rows.map((row) => [row.shop, row.status])).toEqual([["alpha.myshopify.com", "pending"]]);
    });
  });

  it("sends each merchant one mail through the real pipeline, and a replayed step sends nothing twice", async () => {
    // The Email Sending binding is the outermost boundary and is replaced: nothing leaves the machine.
    const sent: { to: unknown; subject: unknown; text: unknown }[] = [];
    const live: Env = Object.assign({}, env, {
      EMAIL: { send: async (message: { to: unknown; subject: unknown; text: unknown }) => { sent.push(message); return { messageId: "m" }; } },
      EMAIL_FROM: "noreply@workmanjsc.vn",
    });
    await runWithRequestContext(live, async () => {
      await db.insert(shops).values([
        { shop: "alpha.myshopify.com", name: "Alpha", email: "alpha@firesio.app", installedAt: 1 },
        { shop: "beta.myshopify.com", name: "Beta", email: "beta@firesio.app", installedAt: 1 },
      ]);
      const deps = campaignDependencies();
      const created = await createDraft(ACTOR, { name: "n", subject: "A big update is coming", body: "Next week.", ctaLabel: "", ctaUrl: "", audience: DEFAULT_AUDIENCE }, deps);
      if (!created.ok) throw new Error("draft refused");
      await startCampaign(ACTOR, { id: created.campaign.id, expectedRecipients: 2 }, deps);

      const step = () => handleCampaignBatch(
        { messages: [{ body: { campaignId: created.campaign.id }, attempts: 1, ack: () => undefined, retry: () => undefined }] },
        { ...campaignConsumerDependencies(), log: () => undefined },
      );
      await step();
      expect(sent).toHaveLength(2);

      // The queue redelivers the same step: the campaign has settled everyone, so nothing more is sent.
      await step();
      await step();
      expect(sent).toHaveLength(2);
      expect(await deps.store.find(created.campaign.id)).toMatchObject({ status: "sent" });
      expect(await deps.store.counts(created.campaign.id)).toEqual({ pending: 0, sent: 2, failed: 0, refused: 0, skipped: 0 });
    });

    expect(sent.map((mail) => mail.to).sort()).toEqual(["alpha@firesio.app", "beta@firesio.app"]);
    expect(sent.every((mail) => mail.subject === "A big update is coming")).toBe(true);
    // Each mail carries its own recipient's unsubscribe link.
    expect(String(sent.find((mail) => mail.to === "alpha@firesio.app")?.text)).toContain("https://example.test/unsubscribe/");
    const logged = await runWithRequestContext(env, async () => db.select().from(notificationLogs).all());
    expect(logged.filter((row) => row.event === "campaign_message" && row.status === "sent")).toHaveLength(2);
  });

  it("does not send a second time when the same recipient's mail is asked for again, even with the campaign's bookkeeping lost", async () => {
    const sent: unknown[] = [];
    const live: Env = Object.assign({}, env, {
      EMAIL: { send: async (message: unknown) => { sent.push(message); return { messageId: "m" }; } },
      EMAIL_FROM: "noreply@workmanjsc.vn",
    });
    await runWithRequestContext(live, async () => {
      await db.insert(shops).values({ shop: "alpha.myshopify.com", name: "Alpha", email: "alpha@firesio.app", installedAt: 1 });
      const deps = campaignDependencies();
      const created = await createDraft(ACTOR, { name: "n", subject: "s", body: "b", ctaLabel: "", ctaUrl: "", audience: DEFAULT_AUDIENCE }, deps);
      if (!created.ok) throw new Error("draft refused");
      await startCampaign(ACTOR, { id: created.campaign.id, expectedRecipients: 1 }, deps);
      const payload = { recipientName: "Alpha", shopName: "Alpha", subject: "s", body: "b", unsubscribeUrl: "https://example.test/unsubscribe/x" };
      const mail = { campaignId: created.campaign.id, shop: "alpha.myshopify.com", email: "alpha@firesio.app", payload };
      expect(await deps.mailer.send(mail)).toEqual({ kind: "sent" });
      // The step died after sending and before settling; the replay asks again: the mail's own dedupe key answers.
      expect(await deps.mailer.send(mail)).toEqual({ kind: "sent" });
    });
    expect(sent).toHaveLength(1);
  });
});
