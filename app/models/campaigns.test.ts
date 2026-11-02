import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { shops } from "~/db/schema";
import { DEFAULT_AUDIENCE, type AudienceFilter } from "~/domain/campaign-audience";
import type { CampaignContent } from "~/domain/campaign";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { previewAudience } from "./campaign-audience.server";
import { CampaignRepo } from "./campaigns.server";
import { CampaignUnsubscribeRepo } from "./campaign-unsubscribes.server";

setupTestDatabase();

const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const CONTENT: CampaignContent = { name: "Big update", subject: "A big update is coming", body: "Next week.", ctaLabel: null, ctaUrl: null };
const DAY = 24 * 60 * 60 * 1000;

/** A spread of shops: every way one can be left out, and the plain cases. */
async function seedShops() {
  await db.insert(shops).values([
    { shop: "a-real.myshopify.com", name: "A Real", email: "A@Firesio.app", installedAt: 10 * DAY },
    { shop: "b-real.myshopify.com", name: "B Real", email: "b@firesio.app", installedAt: 20 * DAY },
    { shop: "c-contact.myshopify.com", name: null, email: "", contactEmail: "Contact@Firesio.app", installedAt: 30 * DAY },
    { shop: "d-dev.myshopify.com", name: "D Dev", email: "d@firesio.app", isDevStore: true, installedAt: 15 * DAY },
    { shop: "e-gone.myshopify.com", name: "E Gone", email: "e@firesio.app", installedAt: 12 * DAY, uninstalledAt: 40 * DAY },
    { shop: "f-noaddr.myshopify.com", name: "F None", email: null, contactEmail: null, installedAt: 11 * DAY },
    { shop: "g-unsub.myshopify.com", name: "G Unsub", email: "G@firesio.app", installedAt: 13 * DAY },
  ]);
  await new CampaignUnsubscribeRepo().add("g@FIRESIO.app", "link", 1);
}

const shopsOf = (rows: readonly { shop: string }[]) => rows.map((row) => row.shop);

describe("previewAudience", () => {
  it("counts who matches and says why some would not receive it", async () => {
    const preview = await inRequest(async () => {
      await seedShops();
      return previewAudience(DEFAULT_AUDIENCE);
    });
    // Real stores still installed: a, b, c, f, g. f has no address, g unsubscribed.
    expect(preview).toMatchObject({ matched: 5, withoutAddress: 1, unsubscribed: 1, recipients: 3 });
    expect(shopsOf(preview.sample)).toEqual(["a-real.myshopify.com", "b-real.myshopify.com", "c-contact.myshopify.com"]);
  });

  it("addresses the owner's email, else the contact email, lower-cased", async () => {
    const preview = await inRequest(async () => {
      await seedShops();
      return previewAudience(DEFAULT_AUDIENCE);
    });
    expect(preview.sample.map((row) => row.email)).toEqual(["a@firesio.app", "b@firesio.app", "contact@firesio.app"]);
    expect(preview.sample[2]?.name).toBe("c-contact.myshopify.com");
  });

  it("never reaches an uninstalled shop, whatever the filter", async () => {
    const preview = await inRequest(async () => {
      await seedShops();
      return previewAudience({ ...DEFAULT_AUDIENCE, kind: "all" });
    });
    expect(shopsOf(preview.sample)).not.toContain("e-gone.myshopify.com");
    expect(preview.matched).toBe(6);
  });

  it.each<[string, AudienceFilter, number]>([
    ["development stores only", { ...DEFAULT_AUDIENCE, kind: "dev" }, 1],
    ["real and development stores", { ...DEFAULT_AUDIENCE, kind: "all" }, 4],
    ["installed on or after day 15", { ...DEFAULT_AUDIENCE, installedAfter: 15 * DAY }, 2],
    ["installed before day 20", { ...DEFAULT_AUDIENCE, installedBefore: 20 * DAY }, 1],
    ["installed within day 10 to 20", { ...DEFAULT_AUDIENCE, installedAfter: 10 * DAY, installedBefore: 20 * DAY }, 1],
    ["a window with nobody in it", { ...DEFAULT_AUDIENCE, installedAfter: 90 * DAY }, 0],
  ])("filters by %s", async (_name, filter, recipients) => {
    const preview = await inRequest(async () => {
      await seedShops();
      return previewAudience(filter);
    });
    expect(preview.recipients).toBe(recipients);
  });

  it("is empty with no shops at all", async () => {
    const preview = await inRequest(() => previewAudience(DEFAULT_AUDIENCE));
    expect(preview).toEqual({ matched: 0, withoutAddress: 0, unsubscribed: 0, recipients: 0, sample: [] });
  });
});

describe("CampaignRepo drafts", () => {
  it("creates a draft and reads it back with its content and audience", async () => {
    const found = await inRequest(async () => {
      const repo = new CampaignRepo();
      await seedStaff();
      const audience: AudienceFilter = { kind: "all", installedAfter: 5, installedBefore: null };
      await repo.create({ id: "c1", content: { ...CONTENT, ctaLabel: "Read", ctaUrl: "https://firesio.app/news" }, audience, createdBy: "staff-1", createdByEmail: "staff@firesio.app", now: 100 });
      return repo.find("c1");
    });
    expect(found).toEqual({
      id: "c1",
      ...CONTENT,
      ctaLabel: "Read",
      ctaUrl: "https://firesio.app/news",
      audience: { kind: "all", installedAfter: 5, installedBefore: null },
      status: "draft",
      pauseReason: null,
      recipientCount: null,
      createdBy: "staff-1",
      createdByEmail: "staff@firesio.app",
      createdAt: 100,
      updatedAt: 100,
      startedAt: null,
      completedAt: null,
      lastPumpAt: null,
    });
  });

  it("answers undefined for a campaign that does not exist", async () => {
    expect(await inRequest(() => new CampaignRepo().find("nope"))).toBeUndefined();
  });

  it("edits and deletes a draft, and refuses both once it is not one", async () => {
    const outcome = await inRequest(async () => {
      const repo = new CampaignRepo();
      await seedStaff();
      await repo.create({ id: "c1", content: CONTENT, audience: DEFAULT_AUDIENCE, createdBy: "staff-1", createdByEmail: "staff@firesio.app", now: 100 });
      const edited = await repo.updateDraft("c1", { ...CONTENT, subject: "New subject" }, { ...DEFAULT_AUDIENCE, kind: "dev" }, 200);
      const after = await repo.find("c1");
      await repo.transition({ id: "c1", from: "draft", to: "cancelled", now: 300 });
      const editedLate = await repo.updateDraft("c1", CONTENT, DEFAULT_AUDIENCE, 400);
      const deletedLate = await repo.deleteDraft("c1");
      await repo.create({ id: "c2", content: CONTENT, audience: DEFAULT_AUDIENCE, createdBy: "staff-1", createdByEmail: "staff@firesio.app", now: 500 });
      return { edited, after, editedLate, deletedLate, deletedDraft: await repo.deleteDraft("c2"), gone: await repo.find("c2") };
    });
    expect(outcome.edited).toBe(true);
    expect(outcome.after).toMatchObject({ subject: "New subject", audience: { kind: "dev" }, updatedAt: 200, status: "draft" });
    expect(outcome.editedLate).toBe(false);
    expect(outcome.deletedLate).toBe(false);
    expect(outcome.deletedDraft).toBe(true);
    expect(outcome.gone).toBeUndefined();
  });

  it("lists newest first and no more than asked", async () => {
    const listed = await inRequest(async () => {
      const repo = new CampaignRepo();
      await seedStaff();
      for (const [id, now] of [["old", 1], ["mid", 2], ["new", 3]] as const) {
        await repo.create({ id, content: { ...CONTENT, name: id }, audience: DEFAULT_AUDIENCE, createdBy: "staff-1", createdByEmail: "staff@firesio.app", now });
      }
      return new CampaignRepo().list(2);
    });
    expect(listed.map((row) => row.name)).toEqual(["new", "mid"]);
  });
});

async function seedStaff() {
  const { adminUsers } = await import("~/db/schema");
  await db.insert(adminUsers).values({ id: "staff-1", email: "staff@firesio.app", name: "Staff", passwordHash: "x", role: "admin", createdAt: 1, updatedAt: 1 });
}

describe("CampaignRepo.start", () => {
  async function draft(repo: CampaignRepo, id = "c1") {
    await seedStaff();
    return repo.create({ id, content: CONTENT, audience: DEFAULT_AUDIENCE, createdBy: "staff-1", createdByEmail: "staff@firesio.app", now: 100 });
  }

  it("fixes the recipients and moves to sending in one step", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new CampaignRepo();
      const created = await draft(repo);
      const count = await repo.start({ id: "c1", audience: created.audience, version: created.updatedAt, now: 200 });
      return { count, campaign: await repo.find("c1"), recipients: await repo.recipients("c1", { limit: 50 }), counts: await repo.counts("c1") };
    });
    expect(outcome.count).toBe(3);
    expect(outcome.campaign).toMatchObject({ status: "sending", recipientCount: 3, startedAt: 200 });
    expect(outcome.recipients.map((row) => [row.shop, row.shopName, row.email, row.status])).toEqual([
      ["a-real.myshopify.com", "A Real", "a@firesio.app", "pending"],
      ["b-real.myshopify.com", "B Real", "b@firesio.app", "pending"],
      ["c-contact.myshopify.com", "c-contact.myshopify.com", "contact@firesio.app", "pending"],
    ]);
    expect(outcome.counts).toEqual({ pending: 3, sent: 0, failed: 0, refused: 0, skipped: 0 });
  });

  it("starts only once: a second start changes nothing and adds nobody", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new CampaignRepo();
      const created = await draft(repo);
      const input = { id: "c1", audience: created.audience, version: created.updatedAt, now: 200 };
      const first = await repo.start(input);
      await db.insert(shops).values({ shop: "late.myshopify.com", name: "Late", email: "late@firesio.app", installedAt: 50 * DAY });
      const second = await repo.start({ ...input, now: 300 });
      return { first, second, campaign: await repo.find("c1"), counts: await repo.counts("c1") };
    });
    expect(outcome.first).toBe(3);
    expect(outcome.second).toBeUndefined();
    expect(outcome.campaign).toMatchObject({ recipientCount: 3, startedAt: 200 });
    expect(outcome.counts.pending).toBe(3);
  });

  it("refuses to start a draft that was edited after it was read, and leaves it a draft with no recipients", async () => {
    const outcome = await inRequest(async () => {
      await seedShops();
      const repo = new CampaignRepo();
      const created = await draft(repo);
      await repo.updateDraft("c1", CONTENT, { ...DEFAULT_AUDIENCE, kind: "all" }, 150);
      const started = await repo.start({ id: "c1", audience: created.audience, version: created.updatedAt, now: 200 });
      return { started, campaign: await repo.find("c1"), counts: await repo.counts("c1") };
    });
    expect(outcome.started).toBeUndefined();
    expect(outcome.campaign).toMatchObject({ status: "draft", recipientCount: null });
    expect(outcome.counts.pending).toBe(0);
  });

  it("never snapshots recipients for a campaign that is not a draft", async () => {
    const counts = await inRequest(async () => {
      await seedShops();
      const repo = new CampaignRepo();
      const created = await draft(repo);
      await repo.transition({ id: "c1", from: "draft", to: "cancelled", now: 150 });
      await repo.start({ id: "c1", audience: created.audience, version: created.updatedAt, now: 200 });
      return repo.counts("c1");
    });
    expect(counts.pending).toBe(0);
  });

  it("starts with zero recipients when nobody matches", async () => {
    const outcome = await inRequest(async () => {
      const repo = new CampaignRepo();
      const created = await draft(repo);
      return { count: await repo.start({ id: "c1", audience: created.audience, version: created.updatedAt, now: 200 }), campaign: await repo.find("c1") };
    });
    expect(outcome.count).toBe(0);
    expect(outcome.campaign).toMatchObject({ status: "sending", recipientCount: 0 });
  });

  it("leaves out an address that unsubscribed before sending started", async () => {
    const emails = await inRequest(async () => {
      await seedShops();
      const repo = new CampaignRepo();
      const created = await draft(repo);
      await new CampaignUnsubscribeRepo().add("B@firesio.app", "link", 2);
      await repo.start({ id: "c1", audience: created.audience, version: created.updatedAt, now: 200 });
      return (await repo.recipients("c1", { limit: 50 })).map((row) => row.email);
    });
    expect(emails).toEqual(["a@firesio.app", "contact@firesio.app"]);
  });
});

describe("CampaignRepo delivery bookkeeping", () => {
  async function sending() {
    await seedShops();
    await seedStaff();
    const repo = new CampaignRepo();
    for (const id of ["c1", "c2"]) {
      const created = await repo.create({ id, content: CONTENT, audience: DEFAULT_AUDIENCE, createdBy: "staff-1", createdByEmail: "staff@firesio.app", now: 100 });
      await repo.start({ id, audience: created.audience, version: created.updatedAt, now: 200 });
    }
    return repo;
  }

  it("offers pending recipients, fewest attempts first, then by shop", async () => {
    const order = await inRequest(async () => {
      const repo = await sending();
      await repo.recordAttempt("c1", "a-real.myshopify.com");
      return (await repo.nextPending("c1", 10)).map((row) => row.shop);
    });
    expect(order).toEqual(["b-real.myshopify.com", "c-contact.myshopify.com", "a-real.myshopify.com"]);
  });

  it("bounds a page", async () => {
    const page = await inRequest(async () => (await sending()).nextPending("c1", 2));
    expect(page).toHaveLength(2);
  });

  it("settles a recipient once: a second settlement does not overwrite the first", async () => {
    const outcome = await inRequest(async () => {
      const repo = await sending();
      await repo.settle("c1", "a-real.myshopify.com", "sent", null, 300);
      await repo.settle("c1", "a-real.myshopify.com", "failed", "rejected", 400);
      const [first] = await repo.recipients("c1", { status: "sent", limit: 5 });
      return { first, counts: await repo.counts("c1"), pending: (await repo.nextPending("c1", 10)).map((row) => row.shop) };
    });
    expect(outcome.first).toMatchObject({ shop: "a-real.myshopify.com", status: "sent", reasonCode: null, settledAt: 300 });
    expect(outcome.counts).toEqual({ pending: 2, sent: 1, failed: 0, refused: 0, skipped: 0 });
    expect(outcome.pending).not.toContain("a-real.myshopify.com");
  });

  it("settles only the campaign named, never another one's recipient of the same shop", async () => {
    const counts = await inRequest(async () => {
      const repo = await sending();
      await repo.settle("c1", "a-real.myshopify.com", "sent", null, 300);
      return { c1: await repo.counts("c1"), c2: await repo.counts("c2") };
    });
    expect(counts.c1.sent).toBe(1);
    expect(counts.c2).toEqual({ pending: 3, sent: 0, failed: 0, refused: 0, skipped: 0 });
  });

  it("records an attempt without settling", async () => {
    const outcome = await inRequest(async () => {
      const repo = await sending();
      await repo.recordAttempt("c1", "a-real.myshopify.com");
      await repo.recordAttempt("c1", "a-real.myshopify.com");
      return (await repo.recipients("c1", { limit: 5 })).find((row) => row.shop === "a-real.myshopify.com");
    });
    expect(outcome).toMatchObject({ status: "pending", attempts: 2 });
  });

  it("skips only what is still waiting, with the reason", async () => {
    const outcome = await inRequest(async () => {
      const repo = await sending();
      await repo.settle("c1", "a-real.myshopify.com", "sent", null, 300);
      const skipped = await repo.skipPending("c1", 500);
      return { skipped, counts: await repo.counts("c1"), reasons: (await repo.recipients("c1", { status: "skipped", limit: 5 })).map((row) => row.reasonCode) };
    });
    expect(outcome.skipped).toBe(2);
    expect(outcome.counts).toEqual({ pending: 0, sent: 1, failed: 0, refused: 0, skipped: 2 });
    expect(outcome.reasons).toEqual(["cancelled", "cancelled"]);
  });

  it("moves a campaign only from the status it is in, and sets and clears the pause reason", async () => {
    const outcome = await inRequest(async () => {
      const repo = await sending();
      const wrongFrom = await repo.transition({ id: "c1", from: "paused", to: "sending", now: 300 });
      const paused = await repo.transition({ id: "c1", from: "sending", to: "paused", now: 400, pauseReason: "high_failure_rate" });
      const whilePaused = await repo.find("c1");
      const resumed = await repo.transition({ id: "c1", from: "paused", to: "sending", now: 500 });
      const done = await repo.transition({ id: "c1", from: "sending", to: "sent", now: 600 });
      return { wrongFrom, paused, whilePaused, resumed, done, final: await repo.find("c1") };
    });
    expect(outcome.wrongFrom).toBe(false);
    expect(outcome.paused).toBe(true);
    expect(outcome.whilePaused).toMatchObject({ status: "paused", pauseReason: "high_failure_rate" });
    expect(outcome.resumed).toBe(true);
    expect(outcome.done).toBe(true);
    expect(outcome.final).toMatchObject({ status: "sent", pauseReason: null, completedAt: 600 });
  });

  it("finds a sending campaign whose chain has gone quiet, and only that", async () => {
    const found = await inRequest(async () => {
      const repo = await sending();
      // c1 pumped recently, c2 never did and started long ago.
      await repo.recordPump("c1", 10_000);
      const quiet = await repo.stalled(5_000, 10);
      const recent = await repo.stalled(150, 10);
      const quietAfterPause = await (async () => {
        await repo.transition({ id: "c2", from: "sending", to: "paused", now: 300 });
        return repo.stalled(5_000, 10);
      })();
      return { quiet, recent, quietAfterPause };
    });
    // c1's last pump (10 000) is after 5 000; c2 started at 200 and never pumped. Before 150 nobody is quiet yet.
    expect(found.quiet).toEqual(["c2"]);
    expect(found.recent).toEqual([]);
    expect(found.quietAfterPause).toEqual([]);
  });
});

describe("CampaignUnsubscribeRepo", () => {
  it("records an address once and finds it in any case", async () => {
    const found = await inRequest(async () => {
      const repo = new CampaignUnsubscribeRepo();
      await repo.add("  Person@Firesio.app ", "link", 1);
      await repo.add("person@firesio.app", "staff", 2);
      return repo.among(["PERSON@firesio.app", "other@firesio.app"]);
    });
    expect([...found]).toEqual(["person@firesio.app"]);
  });

  it("answers for a long list without hitting the bound-parameter limit", async () => {
    const found = await inRequest(async () => {
      const repo = new CampaignUnsubscribeRepo();
      await repo.add("hit@firesio.app", "link", 1);
      const many = Array.from({ length: 250 }, (_, index) => `person-${index}@firesio.app`);
      return repo.among([...many, "hit@firesio.app"]);
    });
    expect([...found]).toEqual(["hit@firesio.app"]);
  });

  it("answers for no addresses", async () => {
    expect([...(await inRequest(() => new CampaignUnsubscribeRepo().among([])))]).toEqual([]);
  });
});
