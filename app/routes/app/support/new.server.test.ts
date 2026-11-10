import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:test";
import { SupportRepo } from "~/models/support.server";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { testIds } from "~/test/fake-runtime";
import { supportService } from "~/wiring.server";
import { createTicket, type CreateTicketOutcome } from "./new.server";
import { fetchShopContact, type AdminGraphql } from "./shop-contact.server";

setupTestDatabase();

afterEach(() => vi.restoreAllMocks());

const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

// SUPPORT_LIMITER is a real binding whose buckets survive between tests: a shop of its own per test.
const newShop = () => `s-${crypto.randomUUID()}.myshopify.com`;

const form = (fields: Record<string, string> = {}) => {
  const data = new FormData();
  const all = { category: "bug", subject: "Checkout is broken", body: "Cannot pay", merchantEmail: "owner@alpha.test", ccEmails: "", ...fields };
  for (const [key, value] of Object.entries(all)) data.set(key, value);
  return data;
};

const shopifyAnswers = (name: string): AdminGraphql => async () =>
  new Response(JSON.stringify({ data: { shop: { name, email: "owner@alpha.test" } } }));

const create = (shop: string, fields: Record<string, string> = {}, graphql: AdminGraphql = shopifyAnswers("Alpha Store")) =>
  createTicket({ shop, form: form(fields), language: "es", graphql });

function created(outcome: CreateTicketOutcome): string {
  if (outcome.kind !== "created") throw new Error(`expected a created ticket, got ${outcome.kind}`);
  return outcome.id;
}

const stage = (shop: string, id: string) =>
  new SupportRepo(testIds).stageUpload({
    id, shop, ticketId: null, r2Key: `support/${shop}/${id}`, filename: `${id}.png`,
    contentType: "image/png", sizeBytes: 10, createdAt: 1, expiresAt: Date.now() + 60_000,
  });

describe("filing a ticket", () => {
  it("stores the ticket against the shop, with the language the form was drawn in and the shop's name", async () => {
    const shop = newShop();
    const thread = await inRequest(async () => {
      const id = created(await create(shop));
      return supportService().find(shop, id);
    });

    expect(thread?.ticket).toMatchObject({ shop, shopName: "Alpha Store", subject: "Checkout is broken", locale: "es", merchantEmail: "owner@alpha.test" });
    expect(thread?.messages.map((message) => message.body)).toEqual(["Cannot pay"]);
  });

  it("answers a refused form with error CODES per field, never the schema's English", async () => {
    const shop = newShop();
    const outcome = await inRequest(() => create(shop, { subject: " ", body: "", merchantEmail: "nope", ccEmails: "a@alpha.test,bad", category: "other" }));

    expect(outcome).toEqual({
      kind: "invalid",
      fieldErrors: { category: "invalid_choice", subject: "required", body: "required", merchantEmail: "invalid_email", ccEmails: "invalid_cc_email" },
    });
    expect(await inRequest(() => supportService().listForShop(shop))).toEqual([]);
  });

  it("does not call Shopify for a form that is refused", async () => {
    const graphql = vi.fn<AdminGraphql>(shopifyAnswers("x"));
    await inRequest(() => create(newShop(), { subject: "" }, graphql));
    expect(graphql).not.toHaveBeenCalled();
  });
});

describe("the shop's name, which is decoration", () => {
  it("asks Shopify with a timeout and no retries", async () => {
    const graphql = vi.fn<AdminGraphql>(shopifyAnswers("Alpha Store"));
    await fetchShopContact(graphql);

    const options = graphql.mock.calls[0]?.[1];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.signal.aborted).toBe(false);
    expect(options?.tries).toBe(1);
  });

  it("falls back to the shop's domain, and logs a structured event, when Shopify times out", async () => {
    const shop = newShop();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const timeout: AdminGraphql = async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    };

    const thread = await inRequest(async () => {
      const id = created(await create(shop, {}, timeout));
      return supportService().find(shop, id);
    });

    expect(thread?.ticket.shopName).toBe(shop);
    expect(thread?.messages).toHaveLength(1);
    const events = log.mock.calls.map(([line]) => String(line)).filter((line) => line.includes("admin.support.shop_name.failed"));
    expect(events).toHaveLength(1);
    expect(events[0]).toContain("TimeoutError");
    // The structured event carries a hash of the shop, never the domain or any address.
    expect(events[0]).not.toContain(shop);
    expect(events[0]).not.toContain("owner@alpha.test");
  });

  it("falls back to the domain when Shopify answers with something unreadable", async () => {
    const shop = newShop();
    const garbage: AdminGraphql = async () => new Response("<html>bad gateway</html>", { status: 502 });
    const thread = await inRequest(async () => {
      vi.spyOn(console, "log").mockImplementation(() => undefined);
      return supportService().find(shop, created(await create(shop, {}, garbage)));
    });
    expect(thread?.ticket.shopName).toBe(shop);
  });
});

describe("files and repeated sends", () => {
  it("files the ticket, its message and its files together", async () => {
    const shop = newShop();
    const thread = await inRequest(async () => {
      await stage(shop, "up_1");
      return supportService().find(shop, created(await create(shop, { uploadIds: "up_1" })));
    });

    expect(thread?.attachments.map((file) => [file.id, file.messageId])).toEqual([["up_1", thread?.messages[0]?.id]]);
  });

  it("refuses the whole ticket when an upload is gone, and keeps the others for the next try", async () => {
    const shop = newShop();
    const { outcome, tickets, kept } = await inRequest(async () => {
      await stage(shop, "up_1");
      const outcome = await create(shop, { uploadIds: "up_1,up_gone" });
      return { outcome, tickets: await supportService().listForShop(shop), kept: await new SupportRepo(testIds).claimUploads(shop, ["up_1"], Date.now()) };
    });

    expect(outcome).toEqual({ kind: "refused", error: "invalid_upload" });
    expect(tickets).toEqual([]);
    expect(kept).toHaveLength(1);
  });

  it("files ONE ticket when the same form is sent twice, and answers both with it", async () => {
    const shop = newShop();
    const key = crypto.randomUUID();
    const { outcomes, tickets } = await inRequest(async () => {
      const outcomes = await Promise.all([create(shop, { submissionKey: key }), create(shop, { submissionKey: key })]);
      outcomes.push(await create(shop, { submissionKey: key }));
      return { outcomes, tickets: await supportService().listForShop(shop) };
    });

    expect(new Set(outcomes.map(created))).toEqual(new Set([key]));
    expect(tickets).toHaveLength(1);
  });

  it("files two tickets for two different forms with the same words", async () => {
    const shop = newShop();
    const tickets = await inRequest(async () => {
      await create(shop, { submissionKey: crypto.randomUUID() });
      await create(shop, { submissionKey: crypto.randomUUID() });
      return supportService().listForShop(shop);
    });
    expect(tickets).toHaveLength(2);
  });

  it("ignores a submission key that is not a uuid instead of using it as an id", async () => {
    const shop = newShop();
    const id = await inRequest(async () => created(await create(shop, { submissionKey: "../../etc/passwd" })));
    expect(id).not.toContain("passwd");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("CANNOT use another shop's submission key to reach its ticket", async () => {
    const shop = newShop();
    const key = crypto.randomUUID();
    const { thread } = await inRequest(async () => {
      created(await create(shop, { submissionKey: key }));
      await expect(create(newShop(), { submissionKey: key, subject: "hijack" })).rejects.toThrow();
      return { thread: await supportService().find(shop, key) };
    });

    expect(thread?.ticket.subject).toBe("Checkout is broken");
    expect(thread?.messages).toHaveLength(1);
  });

  it("refuses a ticket past the shop's rate limit, writing nothing", async () => {
    const shop = newShop();
    const outcomes = await inRequest(async () => {
      const results: CreateTicketOutcome[] = [];
      for (let attempt = 0; attempt < 12; attempt += 1) results.push(await create(shop, { submissionKey: crypto.randomUUID() }));
      return results;
    });
    expect(outcomes.filter((outcome) => outcome.kind === "refused")).toEqual([{ kind: "refused", error: "rate_limited" }, { kind: "refused", error: "rate_limited" }]);
  });
});
