import { describe, expect, it } from "vitest";
import { env } from "cloudflare:test";
import { SupportRepo } from "~/models/support.server";
import { runWithRequestContext } from "~/request-context.server";
import { verifyAttachmentToken } from "~/support/file-token";
import { setupTestDatabase } from "~/test/db";
import { testIds } from "~/test/fake-runtime";
import { supportService } from "~/wiring.server";
import { readAttachmentLinks, readThread, runThreadAction } from "./detail.server";

setupTestDatabase();

const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

// SUPPORT_LIMITER is a real binding whose buckets survive between tests: a shop of its own per test.
const newShop = () => `s-${crypto.randomUUID()}.myshopify.com`;

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

async function openTicket(shop: string) {
  const opened = await supportService().openTicket({ shop, shopName: "Alpha Store", merchantEmail: null, ccEmails: [], category: "bug", subject: "Checkout", body: "Cannot pay" });
  if (!opened.ok) throw new Error(`fixture: ${opened.reason}`);
  return opened.value;
}

const stage = (shop: string, id: string, expiresAt = Date.now() + 60_000) =>
  new SupportRepo(testIds).stageUpload({
    id, shop, ticketId: null, r2Key: `support/${shop}/${id}`, filename: `${id}.png`,
    contentType: "image/png", sizeBytes: 2048, createdAt: 1, expiresAt,
  });

const reply = (shop: string, ticketId: string, fields: Record<string, string>) =>
  runThreadAction({ shop, ticketId, form: form({ intent: "reply", ...fields }) });

describe("replying to a ticket", () => {
  it("takes a reply on a CLOSED ticket and reopens it", async () => {
    const shop = newShop();
    const thread = await inRequest(async () => {
      const ticket = await openTicket(shop);
      await supportService().closeAsStaff(ticket.id);
      expect((await supportService().find(shop, ticket.id))?.ticket.closedAt).not.toBeNull();

      const outcome = await reply(shop, ticket.id, { body: "It is still broken." });
      expect(outcome).toEqual({ ok: true, success: "replied" });
      return supportService().find(shop, ticket.id);
    });

    expect(thread?.ticket.closedAt).toBeNull();
    expect(thread?.ticket.lastAuthor).toBe("merchant");
    expect(thread?.messages.map((message) => message.body)).toEqual(["Cannot pay", "It is still broken."]);
  });

  it("attaches the files to the reply that was just stored, not to whichever message is newest", async () => {
    const shop = newShop();
    const thread = await inRequest(async () => {
      const ticket = await openTicket(shop);
      await stage(shop, "up_1");
      const outcome = await reply(shop, ticket.id, { body: "screenshot", uploadIds: "up_1" });
      expect(outcome.ok).toBe(true);
      // Staff answer after the merchant: they are now the newest message.
      await supportService().replyAsStaff({ ticketId: ticket.id, staffName: "Sam", body: "thanks" });
      return supportService().find(shop, ticket.id);
    });

    const mine = thread?.messages.find((message) => message.body === "screenshot");
    expect(thread?.messages.at(-1)?.author).toBe("staff");
    expect(thread?.attachments.map((file) => file.messageId)).toEqual([mine?.id]);
  });

  it("refuses a reply whose files are gone, writes nothing, and lets the same form be sent again once fixed", async () => {
    const shop = newShop();
    const key = crypto.randomUUID();
    const { refused, afterRefusal, retry, thread } = await inRequest(async () => {
      const ticket = await openTicket(shop);
      await stage(shop, "up_good");

      const refused = await reply(shop, ticket.id, { body: "with files", uploadIds: "up_good,up_gone", submissionKey: key });
      const afterRefusal = await supportService().find(shop, ticket.id);
      // The merchant removes the dead attachment and sends the same form again.
      const retry = await reply(shop, ticket.id, { body: "with files", uploadIds: "up_good", submissionKey: key });
      return { refused, afterRefusal, retry, thread: await supportService().find(shop, ticket.id) };
    });

    expect(refused).toEqual({ ok: false, error: "invalid_upload", status: 400 });
    expect(afterRefusal?.messages).toHaveLength(1);
    expect(afterRefusal?.attachments).toEqual([]);
    expect(retry).toEqual({ ok: true, success: "replied" });
    expect(thread?.messages).toHaveLength(2);
    expect(thread?.attachments.map((file) => file.id)).toEqual(["up_good"]);
  });

  it("stores a reply sent twice once, so a double click or a retry cannot duplicate it", async () => {
    const shop = newShop();
    const key = crypto.randomUUID();
    const thread = await inRequest(async () => {
      const ticket = await openTicket(shop);
      const fields = { body: "once only", submissionKey: key };
      await Promise.all([reply(shop, ticket.id, fields), reply(shop, ticket.id, fields)]);
      expect(await reply(shop, ticket.id, fields)).toEqual({ ok: true, success: "replied" });
      return supportService().find(shop, ticket.id);
    });

    expect(thread?.messages.filter((message) => message.body === "once only")).toHaveLength(1);
  });

  it("asks for words or a file, and treats a file alone as enough", async () => {
    const shop = newShop();
    const outcomes = await inRequest(async () => {
      const ticket = await openTicket(shop);
      await stage(shop, "up_only");
      return [await reply(shop, ticket.id, { body: "   " }), await reply(shop, ticket.id, { body: "", uploadIds: "up_only" })];
    });

    expect(outcomes).toEqual([{ ok: false, error: "empty_reply", status: 400 }, { ok: true, success: "replied" }]);
  });

  it("CANNOT reply to, or attach to, another shop's ticket", async () => {
    const shop = newShop();
    const intruder = newShop();
    const { outcome, thread, kept } = await inRequest(async () => {
      const ticket = await openTicket(shop);
      await stage(intruder, "up_theirs");
      const outcome = await reply(intruder, ticket.id, { body: "let me in", uploadIds: "up_theirs" });
      return {
        outcome,
        thread: await supportService().find(shop, ticket.id),
        kept: await new SupportRepo(testIds).claimUploads(intruder, ["up_theirs"], Date.now()),
      };
    });

    expect(outcome).toMatchObject({ ok: false, error: "not_found", status: 404 });
    expect(thread?.messages).toHaveLength(1);
    expect(thread?.attachments).toEqual([]);
    expect(kept).toHaveLength(1);
  });

  it("CANNOT adopt another shop's staged upload into its own reply", async () => {
    const shop = newShop();
    const other = newShop();
    const { outcome, thread } = await inRequest(async () => {
      const ticket = await openTicket(shop);
      await stage(other, "up_other");
      return { outcome: await reply(shop, ticket.id, { body: "x", uploadIds: "up_other" }), thread: await supportService().find(shop, ticket.id) };
    });

    expect(outcome).toEqual({ ok: false, error: "invalid_upload", status: 400 });
    expect(thread?.messages).toHaveLength(1);
  });
});

describe("the copy list", () => {
  it("saves a valid list on the shop's own ticket", async () => {
    const shop = newShop();
    const thread = await inRequest(async () => {
      const ticket = await openTicket(shop);
      const outcome = await runThreadAction({ shop, ticketId: ticket.id, form: form({ intent: "cc", ccEmails: "a@alpha.test, B@alpha.test" }) });
      expect(outcome).toEqual({ ok: true, success: "ccSaved" });
      return supportService().find(shop, ticket.id);
    });
    expect(thread?.ticket.ccEmails).toEqual(["a@alpha.test", "b@alpha.test"]);
  });

  it("refuses an invalid list and a ticket that is not the shop's", async () => {
    const shop = newShop();
    const { invalid, foreign, thread } = await inRequest(async () => {
      const ticket = await openTicket(shop);
      return {
        invalid: await runThreadAction({ shop, ticketId: ticket.id, form: form({ intent: "cc", ccEmails: "not-an-email" }) }),
        foreign: await runThreadAction({ shop: newShop(), ticketId: ticket.id, form: form({ intent: "cc", ccEmails: "x@alpha.test" }) }),
        thread: await supportService().find(shop, ticket.id),
      };
    });

    expect(invalid).toEqual({ ok: false, error: "invalid_cc", status: 400 });
    expect(foreign).toEqual({ ok: false, error: "not_found", status: 404 });
    expect(thread?.ticket.ccEmails).toEqual([]);
  });
});

describe("reading the thread", () => {
  it("reads the shop's thread with each file's kind, and marks it read", async () => {
    const shop = newShop();
    const read = await inRequest(async () => {
      const ticket = await openTicket(shop);
      await stage(shop, "up_img");
      await reply(shop, ticket.id, { body: "pic", uploadIds: "up_img" });
      return readThread(shop, ticket.id);
    });

    expect(read?.ticket).toMatchObject({ subject: "Checkout", status: "open", category: "bug" });
    expect(read?.messages.at(-1)?.attachments[0]).toMatchObject({ id: "up_img", kind: "image", filename: "up_img.png" });
  });

  it("CANNOT read another shop's thread", async () => {
    const shop = newShop();
    const read = await inRequest(async () => {
      const ticket = await openTicket(shop);
      return readThread(newShop(), ticket.id);
    });
    expect(read).toBeNull();
  });

  it("signs fresh links for the shop's own attachments only", async () => {
    const shop = newShop();
    const { mine, theirs, attachmentId } = await inRequest(async () => {
      const ticket = await openTicket(shop);
      await stage(shop, "up_img");
      await reply(shop, ticket.id, { body: "pic", uploadIds: "up_img" });
      return { mine: await readAttachmentLinks(shop, ticket.id), theirs: await readAttachmentLinks(newShop(), ticket.id), attachmentId: "up_img" };
    });

    expect(theirs).toEqual([]);
    expect(mine.map((link) => link.id)).toEqual([attachmentId]);
    const token = new URL(mine[0]?.url ?? "", "https://example.test").searchParams.get("token") ?? "";
    expect(await verifyAttachmentToken({ secret: "test-attachment-secret", attachmentId, token, now: Date.now() })).toBe(true);
    // And the link is only good for an hour.
    expect(await verifyAttachmentToken({ secret: "test-attachment-secret", attachmentId, token, now: Date.now() + 61 * 60 * 1000 })).toBe(false);
  });
});
