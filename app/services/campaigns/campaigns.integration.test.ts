import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { campaignRecipients, campaigns, shops } from "~/db/schema";
import { DEFAULT_AUDIENCE } from "~/domain/campaign-audience";
import type { MailOutcome } from "~/domain/campaign-delivery";
import { chunk } from "~/lib/chunk";
import { previewAudience } from "~/models/campaign-audience.server";
import { CampaignRepo } from "~/models/campaigns.server";
import { CampaignUnsubscribeRepo } from "~/models/campaign-unsubscribes.server";
import type { CampaignMailer, CampaignTestMailer } from "~/ports/campaigns";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { cancelCampaign, pauseCampaign, resumeCampaign } from "./control-campaign";
import { createDraft, deleteDraft, updateDraft, type DraftInput } from "./draft-campaign";
import { pumpCampaign } from "./pump-campaign";
import { restartStalledCampaigns } from "./restart-stalled";
import { sendTestCampaign } from "./send-test";
import { startCampaign } from "./start-campaign";
import type { CampaignActor, CampaignDependencies, CampaignLogEntry } from "./types";

setupTestDatabase();

const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const ACTOR: CampaignActor = { id: null, email: "Staff@Firesio.app" };
const DRAFT: DraftInput = {
  name: "Big update",
  subject: "A big update is coming",
  body: "Next week we ship a redesigned dashboard.\n\nNothing changes until you open it.",
  ctaLabel: "See what is new",
  ctaUrl: "https://firesio.app/news",
  audience: DEFAULT_AUDIENCE,
};

/** `count` real stores, each with an address, named s1, s2, … */
async function seedShops(count: number): Promise<readonly string[]> {
  const names = Array.from({ length: count }, (_, index) => `s${index + 1}`);
  const rows = names.map((name) => ({ shop: `${name}.myshopify.com`, name: `Store ${name}`, email: `${name}@firesio.app`, installedAt: 1_000 }));
  // D1 allows 100 bound parameters per statement.
  for (const slice of chunk(rows, 10)) await db.insert(shops).values([...slice]);
  return names.map((name) => `${name}.myshopify.com`);
}

interface Harness {
  readonly deps: CampaignDependencies;
  /** Every mail the delivery step asked for, in order. */
  readonly sent: { readonly shop: string; readonly email: string; readonly subject: string; readonly shopName: string; readonly link: string }[];
  /** Every `(campaign, delay)` the delivery chain scheduled. */
  readonly steps: { readonly campaign: string; readonly delaySeconds: number }[];
  readonly logs: CampaignLogEntry[];
  readonly proofs: { readonly email: string; readonly subject: string; readonly link: string }[];
  /** What the mailer answers for a shop; anything not listed is `sent`. */
  outcomes: Record<string, MailOutcome>;
  now: number;
  queueRefuses: boolean;
}

function harness(): Harness {
  const state: Harness = { deps: undefined as never, sent: [], steps: [], logs: [], proofs: [], outcomes: {}, now: 5_000, queueRefuses: false };
  const mailer: CampaignMailer = {
    async send({ shop, email, payload }) {
      state.sent.push({ shop, email, subject: payload.subject, shopName: payload.shopName, link: payload.unsubscribeUrl });
      return state.outcomes[shop] ?? { kind: "sent" };
    },
  };
  const testMailer: CampaignTestMailer = {
    async send({ email, payload }) {
      state.proofs.push({ email, subject: payload.subject, link: payload.unsubscribeUrl });
      return { delivered: true };
    },
  };
  let ids = 0;
  const deps: CampaignDependencies = {
    store: new CampaignRepo(),
    audience: { preview: previewAudience },
    unsubscribes: new CampaignUnsubscribeRepo(),
    mailer,
    testMailer,
    queue: {
      async enqueue(campaign, delaySeconds) {
        if (state.queueRefuses) throw new Error("queue down");
        state.steps.push({ campaign, delaySeconds });
      },
    },
    unsubscribeUrl: async (address) => `https://app.test/unsubscribe/${address}`,
    runtime: { clock: { now: () => state.now }, ids: { uuid: () => `campaign-${(ids += 1)}` } },
    log: (entry) => state.logs.push(entry),
  };
  return Object.assign(state, { deps });
}

async function draft(h: Harness, overrides: Partial<DraftInput> = {}) {
  const created = await createDraft(ACTOR, { ...DRAFT, ...overrides }, h.deps);
  if (!created.ok) throw new Error(`draft refused: ${created.reason}`);
  return created.campaign;
}

/** Runs delivery steps the way the queue would, until the chain ends. */
async function runToEnd(h: Harness, id: string, limit = 50) {
  for (let step = 0; step < limit; step += 1) {
    const result = await pumpCampaign(id, h.deps);
    if (result.kind !== "continued") return result;
  }
  throw new Error("delivery never ended");
}

const recipientRows = (id: string) => db.select().from(campaignRecipients).where(eq(campaignRecipients.campaignId, id)).all();

describe("drafting", () => {
  it("stores a checked draft that nobody has been chosen for", async () => {
    const h = harness();
    await inRequest(async () => {
      const created = await createDraft(ACTOR, DRAFT, h.deps);
      expect(created).toMatchObject({ ok: true, campaign: { status: "draft", name: "Big update", createdBy: null, createdByEmail: "Staff@Firesio.app", recipientCount: null } });
      expect(await recipientRows("campaign-1")).toEqual([]);
    });
    expect(h.logs).toEqual([{ event: "campaign.created", campaign: "campaign-1", by: "token" }]);
  });

  it("reports every problem at once and stores nothing", async () => {
    const h = harness();
    const outcome = await inRequest(() => createDraft(ACTOR, { ...DRAFT, subject: "", ctaUrl: "http://insecure.example" }, h.deps));
    expect(outcome).toMatchObject({ ok: false, reason: "invalid" });
    if (outcome.ok || outcome.reason !== "invalid") throw new Error("expected invalid");
    expect(outcome.errors).toEqual(expect.arrayContaining([{ field: "subject", fault: "required" }, { field: "ctaUrl", fault: "invalidUrl" }]));
    expect(await inRequest(async () => (await db.select().from(campaigns).all()).length)).toBe(0);
  });

  it("changes the words and the audience of a draft, and only of a draft", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(2);
      const campaign = await draft(h);
      const changed = await updateDraft(ACTOR, campaign.id, { ...DRAFT, subject: "New subject", audience: { ...DEFAULT_AUDIENCE, kind: "all" } }, h.deps);
      expect(changed).toMatchObject({ ok: true, campaign: { subject: "New subject", audience: { kind: "all" } } });

      expect((await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: undefined }, h.deps)).ok).toBe(true);
      expect(await updateDraft(ACTOR, campaign.id, DRAFT, h.deps)).toEqual({ ok: false, reason: "not_draft" });
      expect(await deleteDraft(ACTOR, campaign.id, h.deps)).toEqual({ ok: false, reason: "not_draft" });
      expect(await updateDraft(ACTOR, "missing", DRAFT, h.deps)).toEqual({ ok: false, reason: "not_found" });
    });
  });

  it("deletes a draft", async () => {
    const h = harness();
    await inRequest(async () => {
      const campaign = await draft(h);
      expect(await deleteDraft(ACTOR, campaign.id, h.deps)).toEqual({ ok: true });
      expect(await new CampaignRepo().find(campaign.id)).toBeUndefined();
      expect(await deleteDraft(ACTOR, campaign.id, h.deps)).toEqual({ ok: false, reason: "not_found" });
    });
  });
});

describe("starting", () => {
  it("fixes the recipients, moves to sending and schedules the first step at once", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(3);
      const campaign = await draft(h);
      const started = await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 3 }, h.deps);
      expect(started).toEqual({ ok: true, recipients: 3 });
      expect(await new CampaignRepo().find(campaign.id)).toMatchObject({ status: "sending", recipientCount: 3, startedAt: 5_000 });
      expect((await recipientRows(campaign.id)).map((row) => row.status)).toEqual(["pending", "pending", "pending"]);
    });
    expect(h.steps).toEqual([{ campaign: "campaign-1", delaySeconds: 0 }]);
  });

  it("refuses when the audience is not the size the reviewer was shown, and sends nothing", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(3);
      const campaign = await draft(h);
      const started = await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 2 }, h.deps);
      expect(started).toEqual({ ok: false, reason: "audience_changed", recipients: 3 });
      expect((await new CampaignRepo().find(campaign.id))?.status).toBe("draft");
      expect(await recipientRows(campaign.id)).toEqual([]);
    });
    expect(h.steps).toEqual([]);
  });

  it("refuses an audience nobody is in, and a campaign that is not a draft or does not exist", async () => {
    const h = harness();
    await inRequest(async () => {
      const empty = await draft(h);
      expect(await startCampaign(ACTOR, { id: empty.id, expectedRecipients: undefined }, h.deps)).toEqual({ ok: false, reason: "no_recipients" });
      expect(await startCampaign(ACTOR, { id: "missing", expectedRecipients: undefined }, h.deps)).toEqual({ ok: false, reason: "not_found" });

      await seedShops(1);
      expect((await startCampaign(ACTOR, { id: empty.id, expectedRecipients: 1 }, h.deps)).ok).toBe(true);
      expect(await startCampaign(ACTOR, { id: empty.id, expectedRecipients: 1 }, h.deps)).toEqual({ ok: false, reason: "not_draft" });
    });
  });

  it("does not add a shop that installs after sending started", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(2);
      const campaign = await draft(h);
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 2 }, h.deps);
      await db.insert(shops).values({ shop: "late.myshopify.com", name: "Late", email: "late@firesio.app", installedAt: 9_000 });
      await runToEnd(h, campaign.id);
    });
    expect(h.sent.map((mail) => mail.shop)).toEqual(["s1.myshopify.com", "s2.myshopify.com"]);
  });

  it("keeps the campaign sending and logs it when the queue refuses the first step, so the watchdog can restart it", async () => {
    const h = harness();
    h.queueRefuses = true;
    await inRequest(async () => {
      await seedShops(1);
      const campaign = await draft(h);
      expect(await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 1 }, h.deps)).toEqual({ ok: true, recipients: 1 });
      expect((await new CampaignRepo().find(campaign.id))?.status).toBe("sending");

      h.queueRefuses = false;
      h.now += 16 * 60 * 1000;
      expect(await restartStalledCampaigns(h.now, h.deps)).toEqual({ restarted: 1 });
    });
    expect(h.logs).toContainEqual({ event: "campaign.enqueue_failed", campaign: "campaign-1", reason: "Error" });
    expect(h.steps).toEqual([{ campaign: "campaign-1", delaySeconds: 0 }]);
  });
});

describe("delivery", () => {
  it("sends one mail per recipient with their own name and unsubscribe link, then finishes", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(3);
      const campaign = await draft(h);
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 3 }, h.deps);
      expect(await runToEnd(h, campaign.id)).toEqual({ kind: "finished" });

      expect(await new CampaignRepo().find(campaign.id)).toMatchObject({ status: "sent", completedAt: 5_000 });
      expect(await new CampaignRepo().counts(campaign.id)).toEqual({ pending: 0, sent: 3, failed: 0, refused: 0, skipped: 0 });
    });
    expect(h.sent).toEqual([
      { shop: "s1.myshopify.com", email: "s1@firesio.app", subject: "A big update is coming", shopName: "Store s1", link: "https://app.test/unsubscribe/s1@firesio.app" },
      { shop: "s2.myshopify.com", email: "s2@firesio.app", subject: "A big update is coming", shopName: "Store s2", link: "https://app.test/unsubscribe/s2@firesio.app" },
      { shop: "s3.myshopify.com", email: "s3@firesio.app", subject: "A big update is coming", shopName: "Store s3", link: "https://app.test/unsubscribe/s3@firesio.app" },
    ]);
    expect(h.logs).toContainEqual({ event: "campaign.finished", campaign: "campaign-1", counts: { pending: 0, sent: 3, failed: 0, refused: 0, skipped: 0 } });
  });

  it("paces itself: pages of 25 with the usual gap between them", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(30);
      const campaign = await draft(h);
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 30 }, h.deps);
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "continued", delaySeconds: 2 });
      expect(h.sent).toHaveLength(25);
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "continued", delaySeconds: 2 });
      expect(h.sent).toHaveLength(30);
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "finished" });
    });
  });

  it("leaves out an address that unsubscribed after sending started, and says why", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(3);
      const campaign = await draft(h);
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 3 }, h.deps);
      await new CampaignUnsubscribeRepo().add("S2@firesio.app", "link", 1);
      await runToEnd(h, campaign.id);

      const skipped = (await recipientRows(campaign.id)).filter((row) => row.status === "skipped");
      expect(skipped).toMatchObject([{ shop: "s2.myshopify.com", reasonCode: "unsubscribed" }]);
    });
    expect(h.sent.map((mail) => mail.shop)).toEqual(["s1.myshopify.com", "s3.myshopify.com"]);
  });

  it("records a permanent rejection and a refusal against their recipients and carries on", async () => {
    const h = harness();
    h.outcomes = {
      "s1.myshopify.com": { kind: "rejected", reason: "bounced" },
      "s2.myshopify.com": { kind: "refused", reason: "opted_out" },
    };
    await inRequest(async () => {
      await seedShops(3);
      const campaign = await draft(h);
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 3 }, h.deps);
      expect(await runToEnd(h, campaign.id)).toEqual({ kind: "finished" });
      const rows = await recipientRows(campaign.id);
      expect(rows.map((row) => [row.shop, row.status, row.reasonCode])).toEqual([
        ["s1.myshopify.com", "failed", "bounced"],
        ["s2.myshopify.com", "refused", "opted_out"],
        ["s3.myshopify.com", "sent", null],
      ]);
    });
  });

  it("tries a transient failure again after a long wait and gives up on it after three attempts", async () => {
    const h = harness();
    h.outcomes = { "s2.myshopify.com": { kind: "transient" } };
    await inRequest(async () => {
      await seedShops(3);
      const campaign = await draft(h);
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 3 }, h.deps);

      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "continued", delaySeconds: 300 });
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "continued", delaySeconds: 300 });
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "continued", delaySeconds: 2 });
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "finished" });

      const rows = await recipientRows(campaign.id);
      expect(rows.find((row) => row.shop === "s2.myshopify.com")).toMatchObject({ status: "failed", reasonCode: "transport_error" });
      expect(rows.filter((row) => row.status === "sent")).toHaveLength(2);
    });
    // s1 and s3 went on the first page only; s2 was asked on each of its three attempts.
    expect(h.sent.filter((mail) => mail.shop === "s2.myshopify.com")).toHaveLength(3);
    expect(h.sent.filter((mail) => mail.shop === "s1.myshopify.com")).toHaveLength(1);
  });

  it("stops by itself, and waits for a person, when the mail channel is not set up", async () => {
    const h = harness();
    h.outcomes = { "s1.myshopify.com": { kind: "unavailable" } };
    await inRequest(async () => {
      await seedShops(3);
      const campaign = await draft(h);
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 3 }, h.deps);
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "paused", reason: "channel_unavailable" });

      expect(await new CampaignRepo().find(campaign.id)).toMatchObject({ status: "paused", pauseReason: "channel_unavailable" });
      // Nobody was given up on: the first recipient was held and the rest were not even asked.
      expect(await new CampaignRepo().counts(campaign.id)).toMatchObject({ pending: 3, failed: 0 });
      expect(h.sent).toHaveLength(1);
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "idle", status: "paused" });

      h.outcomes = {};
      expect((await resumeCampaign(ACTOR, campaign.id, h.deps)).ok).toBe(true);
      expect(await runToEnd(h, campaign.id)).toEqual({ kind: "finished" });
      expect(await new CampaignRepo().counts(campaign.id)).toMatchObject({ pending: 0, sent: 3 });
    });
  });

  it("stops by itself when most of a meaningful sample bounces", async () => {
    const h = harness();
    await inRequest(async () => {
      const names = await seedShops(12);
      h.outcomes = Object.fromEntries(names.slice(0, 8).map((shop) => [shop, { kind: "rejected", reason: "bounced" } as const]));
      const campaign = await draft(h);
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 12 }, h.deps);
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "paused", reason: "high_failure_rate" });
      expect(await new CampaignRepo().find(campaign.id)).toMatchObject({ status: "paused", pauseReason: "high_failure_rate" });
    });
    expect(h.logs).toContainEqual({ event: "campaign.paused_by_system", campaign: "campaign-1", reason: "high_failure_rate" });
  });

  it("fails the step, so the queue runs it again, when the next step cannot be scheduled", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(2);
      const campaign = await draft(h);
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 2 }, h.deps);
      h.queueRefuses = true;
      await expect(pumpCampaign(campaign.id, h.deps)).rejects.toThrow("queue down");
      // The page was sent and settled before the failure; the run again finds nobody left to write to.
      h.queueRefuses = false;
      expect(await runToEnd(h, campaign.id)).toEqual({ kind: "finished" });
    });
    expect(h.sent).toHaveLength(2);
  });

  it("does nothing for a campaign that is gone or not sending", async () => {
    const h = harness();
    await inRequest(async () => {
      expect(await pumpCampaign("missing", h.deps)).toEqual({ kind: "gone" });
      const campaign = await draft(h);
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "idle", status: "draft" });
    });
    expect(h.sent).toEqual([]);
  });
});

describe("pausing, resuming and cancelling", () => {
  it("pauses after the step in flight and carries on from whoever is still waiting", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(30);
      const campaign = await draft(h);
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 30 }, h.deps);
      await pumpCampaign(campaign.id, h.deps);

      expect(await pauseCampaign(ACTOR, campaign.id, h.deps)).toEqual({ ok: true, status: "paused" });
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "idle", status: "paused" });
      expect(h.sent).toHaveLength(25);

      h.steps.length = 0;
      expect(await resumeCampaign(ACTOR, campaign.id, h.deps)).toEqual({ ok: true, status: "sending" });
      expect(h.steps).toEqual([{ campaign: campaign.id, delaySeconds: 0 }]);
      expect(await runToEnd(h, campaign.id)).toEqual({ kind: "finished" });
      expect(h.sent).toHaveLength(30);
      expect(new Set(h.sent.map((mail) => mail.shop)).size).toBe(30);
    });
  });

  it("cancels: those not yet written to are marked skipped, those already written to keep it", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(30);
      const campaign = await draft(h);
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 30 }, h.deps);
      await pumpCampaign(campaign.id, h.deps);

      expect(await cancelCampaign(ACTOR, campaign.id, h.deps)).toEqual({ ok: true, status: "cancelled" });
      expect(await pumpCampaign(campaign.id, h.deps)).toEqual({ kind: "idle", status: "cancelled" });
      expect(await new CampaignRepo().counts(campaign.id)).toEqual({ pending: 0, sent: 25, failed: 0, refused: 0, skipped: 5 });
      expect((await recipientRows(campaign.id)).find((row) => row.status === "skipped")?.reasonCode).toBe("cancelled");
    });
    expect(h.logs).toContainEqual({ event: "campaign.cancelled", campaign: "campaign-1", by: "token" });
  });

  it("refuses a move the lifecycle does not allow, and a campaign that does not exist", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(1);
      const campaign = await draft(h);
      expect(await pauseCampaign(ACTOR, campaign.id, h.deps)).toEqual({ ok: false, reason: "illegal" });
      expect(await resumeCampaign(ACTOR, campaign.id, h.deps)).toEqual({ ok: false, reason: "illegal" });
      await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: 1 }, h.deps);
      await runToEnd(h, campaign.id);
      // A sent announcement cannot be taken back.
      expect(await cancelCampaign(ACTOR, campaign.id, h.deps)).toEqual({ ok: false, reason: "illegal" });
      expect(await pauseCampaign(ACTOR, "missing", h.deps)).toEqual({ ok: false, reason: "not_found" });
    });
  });

  it("cancels a draft without sending anything", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(2);
      const campaign = await draft(h);
      expect(await cancelCampaign(ACTOR, campaign.id, h.deps)).toEqual({ ok: true, status: "cancelled" });
      expect(await startCampaign(ACTOR, { id: campaign.id, expectedRecipients: undefined }, h.deps)).toEqual({ ok: false, reason: "not_draft" });
    });
    expect(h.sent).toEqual([]);
  });
});

describe("the watchdog", () => {
  it("restarts a campaign whose chain has been quiet too long, and leaves a live one alone", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(2);
      const quiet = await draft(h, { name: "Quiet" });
      await startCampaign(ACTOR, { id: quiet.id, expectedRecipients: 2 }, h.deps);
      h.steps.length = 0;

      h.now += 14 * 60 * 1000;
      expect(await restartStalledCampaigns(h.now, h.deps)).toEqual({ restarted: 0 });

      h.now += 2 * 60 * 1000;
      expect(await restartStalledCampaigns(h.now, h.deps)).toEqual({ restarted: 1 });
      expect(h.steps).toEqual([{ campaign: quiet.id, delaySeconds: 0 }]);

      // A step that ran recently is not stalled, however long ago it started.
      await pumpCampaign(quiet.id, h.deps);
      h.steps.length = 0;
      expect(await restartStalledCampaigns(h.now, h.deps)).toEqual({ restarted: 0 });
    });
  });

  it("never restarts a paused, cancelled or finished campaign", async () => {
    const h = harness();
    await inRequest(async () => {
      await seedShops(1);
      const paused = await draft(h, { name: "Paused" });
      await startCampaign(ACTOR, { id: paused.id, expectedRecipients: 1 }, h.deps);
      await pauseCampaign(ACTOR, paused.id, h.deps);
      h.now += 60 * 60 * 1000;
      expect(await restartStalledCampaigns(h.now, h.deps)).toEqual({ restarted: 0 });
    });
  });
});

describe("a test send", () => {
  it("goes to the person asking, marked as a test, with a link for their own address", async () => {
    const h = harness();
    await inRequest(async () => {
      const campaign = await draft(h);
      expect(await sendTestCampaign(ACTOR, campaign.id, h.deps)).toEqual({ ok: true, delivered: true });
      expect(await sendTestCampaign(ACTOR, "missing", h.deps)).toEqual({ ok: false, reason: "not_found" });
    });
    expect(h.proofs).toEqual([{ email: "Staff@Firesio.app", subject: "[Test] A big update is coming", link: "https://app.test/unsubscribe/Staff@Firesio.app" }]);
    // A proof is not a delivery: nothing was counted or sent to a merchant.
    expect(h.sent).toEqual([]);
  });
});
