import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { sequentialIds } from "~/test/fake-runtime";
import type { NewHeldMail } from "~/ports/support-triage";
import { SupportTriageRepo } from "./support-triage.server";

setupTestDatabase();

const inRequest = <T>(fn: (repo: SupportTriageRepo) => Promise<T>) =>
  runWithRequestContext(env, () => fn(new SupportTriageRepo(sequentialIds("held"))));

function held(over: Partial<NewHeldMail> = {}): NewHeldMail {
  return {
    externalId: "m1@mail.example",
    source: "email",
    reason: "ai_spam",
    senderEmail: "seo@spam.example",
    senderName: "SEO",
    shopHint: null,
    shopName: null,
    subject: "Rank #1",
    body: "Buy links",
    createdAt: 1_000,
    ...over,
  };
}

describe("held mail", () => {
  it("stores a mail and reads it back whole", async () => {
    const found = await inRequest(async (repo) => {
      expect(await repo.hold(held({ shopHint: "a.myshopify.com", shopName: "Alpha", source: "shopify_relay", reason: "flood" }))).toBe(true);
      const [listed] = await repo.listHeld();
      return listed ? repo.find(listed.id) : null;
    });

    expect(found).toMatchObject({
      externalId: "m1@mail.example",
      source: "shopify_relay",
      reason: "flood",
      senderEmail: "seo@spam.example",
      senderName: "SEO",
      shopHint: "a.myshopify.com",
      shopName: "Alpha",
      subject: "Rank #1",
      body: "Buy links",
      createdAt: 1_000,
    });
  });

  it("holds the same mail once, however often it is delivered", async () => {
    const result = await inRequest(async (repo) => ({
      first: await repo.hold(held()),
      again: await repo.hold(held()),
      count: (await repo.listHeld()).length,
    }));

    expect(result).toEqual({ first: true, again: false, count: 1 });
  });

  it("lists the newest first", async () => {
    const subjects = await inRequest(async (repo) => {
      await repo.hold(held({ externalId: "a", subject: "older", createdAt: 1 }));
      await repo.hold(held({ externalId: "b", subject: "newer", createdAt: 2 }));
      return (await repo.listHeld()).map((mail) => mail.subject);
    });

    expect(subjects).toEqual(["newer", "older"]);
  });

  it("finds nothing for an id that was never held", async () => {
    expect(await inRequest((repo) => repo.find("nope"))).toBeNull();
  });

  it("discards one mail, and says so when it is already gone", async () => {
    const result = await inRequest(async (repo) => {
      await repo.hold(held({ externalId: "a" }));
      await repo.hold(held({ externalId: "b", subject: "kept" }));
      const [first] = await repo.listHeld();
      if (!first) throw new Error("expected a held mail");
      return { removed: await repo.discard(first.id), again: await repo.discard(first.id), left: (await repo.listHeld()).length };
    });

    expect(result).toEqual({ removed: true, again: false, left: 1 });
  });

  it("discards everything from one mailbox and nobody else's", async () => {
    const result = await inRequest(async (repo) => {
      await repo.hold(held({ externalId: "a" }));
      await repo.hold(held({ externalId: "b" }));
      await repo.hold(held({ externalId: "c", senderEmail: "jane@buyer.example" }));
      return { removed: await repo.discardFromSender("seo@spam.example"), left: (await repo.listHeld()).map((mail) => mail.senderEmail) };
    });

    expect(result).toEqual({ removed: 2, left: ["jane@buyer.example"] });
  });
});

describe("blocked senders", () => {
  it("starts empty", async () => {
    expect(await inRequest((repo) => repo.patterns())).toEqual([]);
  });

  it("keeps a pattern once, with the first author", async () => {
    const result = await inRequest(async (repo) => {
      await repo.block({ pattern: "spam.example", createdBy: "ann@x.test", at: 1 });
      await repo.block({ pattern: "spam.example", createdBy: "bob@x.test", at: 2 });
      return { patterns: await repo.patterns(), listed: await repo.listBlocked() };
    });

    expect(result.patterns).toEqual(["spam.example"]);
    expect(result.listed).toEqual([{ pattern: "spam.example", createdBy: "ann@x.test", createdAt: 1 }]);
  });

  it("lists the newest first, and unblocking removes only that pattern", async () => {
    const result = await inRequest(async (repo) => {
      await repo.block({ pattern: "a.example", createdBy: "ann@x.test", at: 1 });
      await repo.block({ pattern: "b.example", createdBy: "ann@x.test", at: 2 });
      const before = (await repo.listBlocked()).map((entry) => entry.pattern);
      await repo.unblock("a.example");
      return { before, after: await repo.patterns() };
    });

    expect(result).toEqual({ before: ["b.example", "a.example"], after: ["b.example"] });
  });
});
