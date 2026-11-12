import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { SupportRepo } from "./support.server";
import { statusOf } from "~/support/status";
import { testIds } from "~/test/fake-runtime";
import { defined } from "~/test/defined";

const SHOP = "alpha.myshopify.com";
const OTHER = "beta.myshopify.com";

setupTestDatabase();

const run = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

/** Open a ticket the way the service does: ticket + its first message. */
function open(
  repo: SupportRepo,
  over: { shop?: string; subject?: string; at?: number } = {},
) {
  const at = over.at ?? 1_700_000_000_000;
  return repo.open({
    shop: over.shop ?? SHOP,
    shopName: "Alpha Store",
    merchantEmail: "owner@alpha.test",
    ccEmails: [],
    category: "bug",
    subject: over.subject ?? "Button missing",
    body: "It vanished.",
    authorName: "Alpha Store",
    locale: null,
    at,
  });
}

describe("SupportRepo", () => {
  it("lists and deletes only expired pending uploads across shops", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      await Promise.all([
        repo.stageUpload({
          id: "expired-alpha", shop: SHOP, ticketId: null,
          r2Key: "support/alpha/expired", filename: "old-a.txt",
          contentType: "text/plain", sizeBytes: 1, createdAt: 1, expiresAt: 100,
        }),
        repo.stageUpload({
          id: "active-alpha", shop: SHOP, ticketId: null,
          r2Key: "support/alpha/active", filename: "new-a.txt",
          contentType: "text/plain", sizeBytes: 1, createdAt: 2, expiresAt: 300,
        }),
        repo.stageUpload({
          id: "expired-beta", shop: OTHER, ticketId: null,
          r2Key: "support/beta/expired", filename: "old-b.txt",
          contentType: "text/plain", sizeBytes: 1, createdAt: 3, expiresAt: 100,
        }),
        repo.stageUpload({
          id: "boundary-alpha", shop: SHOP, ticketId: null,
          r2Key: "support/alpha/boundary", filename: "boundary.txt",
          contentType: "text/plain", sizeBytes: 1, createdAt: 4, expiresAt: 200,
        }),
      ]);

      const expired = await repo.listExpiredUploads(200);
      expect(expired).toEqual([
        { id: "expired-alpha", r2Key: "support/alpha/expired" },
        { id: "expired-beta", r2Key: "support/beta/expired" },
        { id: "boundary-alpha", r2Key: "support/alpha/boundary" },
      ]);

      expect(await repo.deleteExpiredUploads(["expired-alpha", "active-alpha", "boundary-alpha", "missing"], 200)).toBe(2);
      expect(await repo.listExpiredUploads(200)).toEqual([
        { id: "expired-beta", r2Key: "support/beta/expired" },
      ]);
    });
  });

  it("limits an expired-upload sweep to one R2 deletion batch", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      await Promise.all(Array.from({ length: 1_001 }, (_, index) => repo.stageUpload({
        id: `expired-${index}`,
        shop: SHOP,
        ticketId: null,
        r2Key: `support/alpha/expired-${index}`,
        filename: "old.txt",
        contentType: "text/plain",
        sizeBytes: 1,
        createdAt: index,
        expiresAt: 100,
      })));

      expect(await repo.listExpiredUploads(200)).toHaveLength(1_000);
    });
  });

  it("stages upload metadata under its owning shop", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      await repo.stageUpload({
        id: "upload-alpha",
        shop: SHOP,
        ticketId: null,
        r2Key: "support/alpha/new/upload-alpha",
        filename: "screen.png",
        contentType: "image/png",
        sizeBytes: 123,
        createdAt: 1_000,
        expiresAt: 2_000,
      });

      expect(await repo.claimPendingUploads(OTHER, ["upload-alpha"], 1_500)).toEqual([]);
    });
  });

  it("opens a ticket whose first message is the merchant's, so it reads as open", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await open(repo);

      const found = await repo.find(SHOP, ticket.id);
      expect(found).toBeDefined();
      expect(found?.ticket.subject).toBe("Button missing");
      expect(found?.messages).toHaveLength(1);
      expect(found?.messages[0]?.author).toBe("merchant");
      // Derived, not stored — the whole point of the model.
      expect(statusOf(defined(found).ticket)).toBe("open");
    });
  });

  it("CANNOT read another shop's ticket, even with the right id", async () => {
    // The id comes from a URL, so it is attacker-controlled. This is the
    // security test @rules/data.md requires, not a nice-to-have.
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await open(repo, { shop: SHOP });

      expect(await repo.find(OTHER, ticket.id)).toBeUndefined();
    });
  });

  it("CANNOT reply to another shop's ticket", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await open(repo, { shop: SHOP });

      const replied = await repo.reply({
        shop: OTHER,
        ticketId: ticket.id,
        author: "merchant",
        authorName: "Beta Store",
        body: "let me in",
        at: 1_700_000_100_000,
      });

      expect(replied).toBeUndefined();
      // And the real owner's thread is untouched.
      const found = await repo.find(SHOP, ticket.id);
      expect(found?.messages).toHaveLength(1);
    });
  });

  it("lists only the asking shop's tickets", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      await open(repo, { shop: SHOP, subject: "mine" });
      await open(repo, { shop: OTHER, subject: "theirs" });

      const mine = await repo.listForShop(SHOP);
      expect(mine.map((t) => t.subject)).toEqual(["mine"]);
    });
  });

  it("flips to answered when staff reply, and back to open when the merchant does", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await open(repo, { at: 1000 });

      await repo.reply({
        shop: SHOP,
        ticketId: ticket.id,
        author: "staff",
        authorName: "Sam",
        body: "Looking now.",
        at: 2000,
      });
      let found = await repo.find(SHOP, ticket.id);
      expect(statusOf(defined(found).ticket)).toBe("answered");
      expect(defined(found).ticket.lastMessageAt).toBe(2000);

      await repo.reply({
        shop: SHOP,
        ticketId: ticket.id,
        author: "merchant",
        authorName: "Alpha Store",
        body: "Thanks!",
        at: 3000,
      });
      found = await repo.find(SHOP, ticket.id);
      expect(statusOf(defined(found).ticket)).toBe("open");
    });
  });

  it("records whether staff asked for an app review as they closed the ticket, and a new close overwrites it", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await open(repo, { at: 1000 });
      expect(defined(await repo.find(SHOP, ticket.id)).ticket.closedAsksReview).toBe(false);

      await repo.closeAsStaff(ticket.id, 2000, true);
      expect(defined(await repo.find(SHOP, ticket.id)).ticket.closedAsksReview).toBe(true);

      await repo.closeAsStaff(ticket.id, 3000, false);
      expect(defined(await repo.find(SHOP, ticket.id)).ticket.closedAsksReview).toBe(false);
      // Another shop cannot read the ticket, so it cannot read the flag either.
      expect(await repo.find("other.myshopify.com", ticket.id)).toBeUndefined();
    });
  });

  it("reopens a closed ticket when the merchant replies", async () => {
    // Otherwise a merchant answering "did that fix it?" is never seen again.
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await open(repo, { at: 1000 });
      await repo.closeAsStaff(ticket.id, 2000, false);
      expect(statusOf(defined(await repo.find(SHOP, ticket.id)).ticket)).toBe("closed");

      await repo.reply({
        shop: SHOP,
        ticketId: ticket.id,
        author: "merchant",
        authorName: "Alpha Store",
        body: "Still broken.",
        at: 3000,
      });

      const found = await repo.find(SHOP, ticket.id);
      expect(statusOf(defined(found).ticket)).toBe("open");
      expect(defined(found).ticket.closedAt).toBeNull();
    });
  });

  it("does not reopen when STAFF reply to a closed ticket", async () => {
    // A closing note should not put the thread back in the queue.
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await open(repo, { at: 1000 });
      await repo.closeAsStaff(ticket.id, 2000, false);

      await repo.reply({
        shop: SHOP,
        ticketId: ticket.id,
        author: "staff",
        authorName: "Sam",
        body: "Closing — shipped in 1.2.",
        at: 3000,
      });

      expect(statusOf(defined(await repo.find(SHOP, ticket.id)).ticket)).toBe("closed");
    });
  });

  it("records read receipts per side without touching the other", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await open(repo, { at: 1000 });

      await repo.markRead(SHOP, ticket.id, "staff", 5000);
      const found = await repo.find(SHOP, ticket.id);
      expect(defined(found).ticket.staffLastReadAt).toBe(5000);
      expect(defined(found).ticket.merchantLastReadAt).toBeNull();
    });
  });

  it("returns the staff queue newest-first, excluding closed threads", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      await open(repo, { shop: SHOP, subject: "older", at: 1000 });
      await open(repo, { shop: OTHER, subject: "newer", at: 2000 });
      const closed = await open(repo, { shop: SHOP, subject: "closed", at: 1500 });
      await repo.closeAsStaff(closed.id, 1600, false);

      const queue = await repo.listOpenForStaff();
      expect(queue.map((t) => t.subject)).toEqual(["newer", "older"]);
      expect(queue.map((t) => t.id)).not.toContain(closed.id);
      // Cross-shop by design: this is the staff view, not a merchant's.
      expect(queue.some((t) => t.shop === OTHER)).toBe(true);
    });
  });

  it("purges every trace of a shop and reports the R2 keys to delete", async () => {
    // shop/redact: the blobs must be named before their rows disappear.
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const mine = await open(repo, { shop: SHOP });
      const theirs = await open(repo, { shop: OTHER });
      await repo.attachMany([{
        shop: SHOP,
        messageId: defined(defined(await repo.find(SHOP, mine.id)).messages[0]).id,
        id: "att_1",
        r2Key: "support/alpha/x",
        filename: "a.png",
        contentType: "image/png",
        sizeBytes: 10,
        at: 1000,
      }]);

      const purged = await repo.purgeShop(SHOP);
      expect(purged.r2Keys).toEqual(["support/alpha/x"]);
      // 1 ticket + 1 message + 1 attachment.
      expect(purged.rows).toBe(3);
      expect(await repo.find(SHOP, mine.id)).toBeUndefined();
      // The other shop is untouched.
      expect(await repo.find(OTHER, theirs.id)).toBeDefined();
    });
  });
  it("attaches many files in one call across statement chunks, scoped to the shop", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const mine = await open(repo, { shop: SHOP });
      const theirs = await open(repo, { shop: OTHER });
      const mineMessage = (await repo.find(SHOP, mine.id))?.messages[0]?.id ?? "";
      await repo.attachMany(Array.from({ length: 25 }, (_, n) => ({
        shop: SHOP, messageId: mineMessage, id: `bulk_${n}`, r2Key: `support/alpha/${n}`,
        filename: `f${n}.png`, contentType: "image/png", sizeBytes: n + 1, at: 1000,
      })));
      await repo.attachMany([]);

      expect((await repo.find(SHOP, mine.id))?.attachments).toHaveLength(25);
      // The other shop's thread never sees them, and its own id cannot reach mine.
      expect((await repo.find(OTHER, theirs.id))?.attachments).toHaveLength(0);
      expect(await repo.find(OTHER, mine.id)).toBeUndefined();
    });
  });

  it("adopts many staged uploads atomically and refuses another shop's uploads", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const mine = await open(repo, { shop: SHOP });
      const message = (await repo.find(SHOP, mine.id))?.messages[0]?.id ?? "";
      const ids = Array.from({ length: 12 }, (_, n) => `up_${n}`);
      await Promise.all(ids.map((id) => repo.stageUpload({
        id, shop: SHOP, ticketId: null, r2Key: `support/alpha/${id}`, filename: `${id}.txt`,
        contentType: "text/plain", sizeBytes: 1, createdAt: 1, expiresAt: 10_000,
      })));

      expect(await repo.adoptPendingUploads(OTHER, message, ids, 5)).toBe(false);
      expect((await repo.find(SHOP, mine.id))?.attachments).toHaveLength(0);

      expect(await repo.adoptPendingUploads(SHOP, message, ids, 5)).toBe(true);
      expect((await repo.find(SHOP, mine.id))?.attachments).toHaveLength(12);
      // Consumed: a replay finds nothing left to claim.
      expect(await repo.adoptPendingUploads(SHOP, message, ids, 6)).toBe(false);
      expect((await repo.find(SHOP, mine.id))?.attachments).toHaveLength(12);
    });
  });

  it("lists a shop's newest tickets with only the columns the list shows, up to the limit", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      await open(repo, { shop: SHOP, subject: "old", at: 1000 });
      await open(repo, { shop: SHOP, subject: "mid", at: 2000 });
      await open(repo, { shop: SHOP, subject: "new", at: 3000 });
      await open(repo, { shop: OTHER, subject: "theirs", at: 4000 });

      const recent = await repo.listRecentForShop(SHOP, 2);
      expect(recent.map((ticket) => ticket.subject)).toEqual(["new", "mid"]);
      expect(Object.keys(defined(recent[0])).sort()).toEqual(
        ["category", "closedAt", "id", "lastAuthor", "lastMessageAt", "merchantLastReadAt", "subject"],
      );
      // Another shop's tickets never appear, however recent.
      expect((await repo.listRecentForShop(OTHER, 10)).map((ticket) => ticket.subject)).toEqual(["theirs"]);
    });
  });
});

/** The files a message carries are written WITH it: one batch, so a failure leaves nothing half-stored. */
describe("SupportRepo writes a message and its files as one unit", () => {
  const stage = (repo: SupportRepo, id: string, shop = SHOP, expiresAt = 10_000) =>
    repo.stageUpload({
      id, shop, ticketId: null, r2Key: `support/${shop}/${id}`, filename: `${id}.txt`,
      contentType: "text/plain", sizeBytes: 1, createdAt: 1, expiresAt,
    });

  const staged = (id: string) => ({ id, r2Key: `support/${SHOP}/${id}`, filename: `${id}.txt`, contentType: "text/plain", sizeBytes: 1 });

  const pendingIds = async (repo: SupportRepo) => (await repo.listExpiredUploads(Number.MAX_SAFE_INTEGER)).map((row) => row.id).sort();

  const input = (over: Partial<Parameters<SupportRepo["open"]>[0]> = {}) => ({
    shop: SHOP, shopName: "Alpha Store", merchantEmail: null, ccEmails: [], category: "bug" as const,
    subject: "Button missing", body: "It vanished.", authorName: "Alpha Store", locale: null, at: 1000, ...over,
  });

  it("opens a ticket, its first message and its attachments together, consuming the staged uploads", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      await Promise.all([stage(repo, "up_a"), stage(repo, "up_b")]);

      const opened = await repo.open(input({ uploads: [staged("up_a"), staged("up_b")] }));

      const thread = defined(await repo.find(SHOP, opened.id));
      expect(opened.created).toBe(true);
      expect(thread.messages.map((message) => message.id)).toEqual([opened.messageId]);
      expect(thread.attachments.map((file) => [file.id, file.messageId]).sort()).toEqual([["up_a", opened.messageId], ["up_b", opened.messageId]]);
      expect(await pendingIds(repo)).toEqual([]);
    });
  });

  it("leaves NO ticket, message or half-adopted file when an attachment cannot be written", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const first = await repo.open(input({ subject: "first" }));
      // An attachment already holds this id, so adopting the same staged upload must fail inside the batch.
      await repo.attachMany([{ shop: SHOP, messageId: first.messageId, id: "up_dup", r2Key: "support/alpha/dup", filename: "dup.txt", contentType: "text/plain", sizeBytes: 1, at: 1 }]);
      await Promise.all([stage(repo, "up_ok"), stage(repo, "up_dup")]);

      await expect(repo.open(input({ subject: "second", at: 2000, uploads: [staged("up_ok"), staged("up_dup")] }))).rejects.toThrow();

      expect((await repo.listForShop(SHOP)).map((ticket) => ticket.subject)).toEqual(["first"]);
      expect(defined(await repo.find(SHOP, first.id)).messages).toHaveLength(1);
      // The good upload was not consumed either: the merchant's retry still has it.
      expect(await pendingIds(repo)).toEqual(["up_dup", "up_ok"]);
    });
  });

  it("answers a repeated submission with the ticket it already made, not a second one", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const key = crypto.randomUUID();

      const first = await repo.open(input({ ticketId: key }));
      const again = await repo.open(input({ ticketId: key, at: 5000 }));

      expect(first).toMatchObject({ id: key, created: true });
      expect(again).toEqual({ id: key, messageId: first.messageId, created: false });
      expect(await repo.listForShop(SHOP)).toHaveLength(1);
      expect(defined(await repo.find(SHOP, key)).messages).toHaveLength(1);
    });
  });

  it("makes one ticket when two identical submissions arrive together", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const key = crypto.randomUUID();

      const [a, b] = await Promise.all([repo.open(input({ ticketId: key })), repo.open(input({ ticketId: key }))]);

      expect([a.created, b.created].sort()).toEqual([false, true]);
      expect(a.messageId).toBe(b.messageId);
      expect(await repo.listForShop(SHOP)).toHaveLength(1);
      expect(defined(await repo.find(SHOP, key)).messages).toHaveLength(1);
    });
  });

  it("does not let another shop's submission key touch a ticket it does not own", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const key = crypto.randomUUID();
      const mine = await repo.open(input({ ticketId: key }));

      await expect(repo.open(input({ shop: OTHER, ticketId: key, subject: "hijack", body: "overwrite" }))).rejects.toThrow();

      expect(await repo.listForShop(OTHER)).toEqual([]);
      const thread = defined(await repo.find(SHOP, mine.id));
      expect(thread.ticket.subject).toBe("Button missing");
      expect(thread.messages).toHaveLength(1);
    });
  });

  it("replies with files in one unit: the message, the reopened ticket and the attachments", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await repo.open(input());
      await repo.closeAsStaff(ticket.id, 1500, false);
      await stage(repo, "up_a");

      const replied = defined(await repo.reply({ shop: SHOP, ticketId: ticket.id, author: "merchant", authorName: "Alpha Store", body: "More", at: 3000, uploads: [staged("up_a")] }));

      const thread = defined(await repo.find(SHOP, ticket.id));
      expect(replied.created).toBe(true);
      expect(thread.attachments.map((file) => file.messageId)).toEqual([replied.messageId]);
      expect(thread.ticket.closedAt).toBeNull();
      expect(thread.ticket.lastMessageAt).toBe(3000);
      expect(await pendingIds(repo)).toEqual([]);
    });
  });

  it("attaches to the reply's own message even when staff wrote last", async () => {
    // The old route adopted onto "the newest message", which a staff reply landing in between would have been.
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await repo.open(input());
      await stage(repo, "up_a");
      const replied = defined(await repo.reply({ shop: SHOP, ticketId: ticket.id, author: "merchant", authorName: "Alpha Store", body: "mine", at: 2000, uploads: [staged("up_a")] }));
      await repo.reply({ shop: SHOP, ticketId: ticket.id, author: "staff", authorName: "Sam", body: "ours", at: 3000 });

      const thread = defined(await repo.find(SHOP, ticket.id));
      expect(thread.messages.at(-1)?.author).toBe("staff");
      expect(thread.attachments.map((file) => file.messageId)).toEqual([replied.messageId]);
    });
  });

  it("leaves the thread exactly as it was when a reply's attachment cannot be written", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await repo.open(input());
      await repo.closeAsStaff(ticket.id, 1500, false);
      await repo.attachMany([{ shop: SHOP, messageId: ticket.messageId, id: "up_dup", r2Key: "support/alpha/dup", filename: "dup.txt", contentType: "text/plain", sizeBytes: 1, at: 1 }]);
      await stage(repo, "up_dup");

      await expect(repo.reply({ shop: SHOP, ticketId: ticket.id, author: "merchant", authorName: "Alpha Store", body: "retry me", at: 3000, uploads: [staged("up_dup")] })).rejects.toThrow();

      const thread = defined(await repo.find(SHOP, ticket.id));
      expect(thread.messages).toHaveLength(1);
      expect(thread.ticket.closedAt).toBe(1500);
      expect(thread.ticket.lastMessageAt).toBe(1000);
      expect(await pendingIds(repo)).toEqual(["up_dup"]);
    });
  });

  it("stores a reply once however many times its key is sent", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const ticket = await repo.open(input());
      const messageId = crypto.randomUUID();
      const send = () => repo.reply({ shop: SHOP, ticketId: ticket.id, author: "merchant", authorName: "Alpha Store", body: "once", at: 2000, messageId });

      const [a, b] = await Promise.all([send(), send()]);
      const c = await send();

      expect([a?.created, b?.created].sort()).toEqual([false, true]);
      expect(c).toEqual({ messageId, created: false });
      expect(defined(await repo.find(SHOP, ticket.id)).messages.map((message) => message.id)).toEqual([ticket.messageId, messageId]);
    });
  });

  it("CANNOT reuse another shop's message id to reply to its own ticket", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      const mine = await repo.open(input({ shop: SHOP }));
      const theirs = await repo.open(input({ shop: OTHER }));

      await expect(repo.reply({ shop: OTHER, ticketId: theirs.id, author: "merchant", authorName: "Beta", body: "x", at: 2000, messageId: mine.messageId })).rejects.toThrow();
      expect(defined(await repo.find(SHOP, mine.id)).messages).toHaveLength(1);
      expect(defined(await repo.find(OTHER, theirs.id)).messages).toHaveLength(1);
    });
  });

  it("claims only this shop's, unexpired, unadopted uploads", async () => {
    await run(async () => {
      const repo = new SupportRepo(testIds);
      await Promise.all([stage(repo, "mine"), stage(repo, "theirs", OTHER), stage(repo, "stale", SHOP, 100)]);

      expect((await repo.claimUploads(SHOP, ["mine", "theirs", "stale", "ghost"], 500)).map((row) => row.id)).toEqual(["mine"]);
      expect(Object.keys(defined((await repo.claimUploads(SHOP, ["mine"], 500))[0])).sort()).toEqual(["contentType", "filename", "id", "r2Key", "sizeBytes"]);
      expect(await repo.claimUploads(SHOP, [], 500)).toEqual([]);
    });
  });
});
