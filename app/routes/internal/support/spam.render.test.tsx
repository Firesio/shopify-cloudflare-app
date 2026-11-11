import { describe, expect, it } from "vitest";
import { renderRoute } from "~/test/render-route";
import Spam from "./spam";

const overview = {
  held: [
    { id: "h1", senderName: "SEO Bot", senderEmail: "seo@spam.example", subject: "Rank #1", preview: "Buy links now", reason: "ai_spam", source: "email", receivedAt: 1_700_000_000_000 },
    { id: "h2", senderName: "Jane", senderEmail: "jane@buyer.example", subject: "Too eager", preview: "Hello", reason: "flood", source: "shopify_relay", receivedAt: 1_700_000_100_000 },
  ],
  blocked: [{ pattern: "spam.example", createdBy: "ann@firesio.app", createdAt: 1_700_000_000_000 }],
};

const page = (stage: "pending" | "settled", data = overview) =>
  renderRoute({
    path: "/internal/support/spam",
    Component: Spam,
    loaderData: { spam: stage === "pending" ? new Promise<never>(() => {}) : Promise.resolve(data) },
    stage,
  });

const cards = (html: string) => html.match(/data-slot="card"/g)?.length ?? 0;
const rowOf = (html: string, subject: string) => [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((match) => match[1] ?? "").find((row) => row.includes(subject)) ?? "";

describe("the spam page's loading state", () => {
  it("has as many cards as the loaded page, so nothing shifts when the data arrives", async () => {
    const pending = cards(await page("pending"));
    // Streaming leaves the fallback in the markup beside the resolved content, so what the
    // settled page adds on top of the pending one is the loaded page itself.
    const loaded = cards(await page("settled")) - pending;

    expect(pending).toBe(loaded);
  });
});

describe("the held mail", () => {
  it("shows each mail's reason in its own row, in plain words", async () => {
    const html = await page("settled");

    expect(rowOf(html, "Rank #1")).toContain("Looks like spam");
    expect(rowOf(html, "Too eager")).toContain("Too many mails");
  });

  it("shows who it is from and a preview of what it said, in the row of the mail they belong to", async () => {
    const row = rowOf(await page("settled"), "Rank #1");

    expect(row).toContain("seo@spam.example");
    expect(row).toContain("Buy links now");
  });

  it("says nothing is held, rather than showing an empty table", async () => {
    const html = await page("settled", { held: [], blocked: [] });

    expect(html).toContain("Nothing held");
    expect(html).toContain("No one is blocked.");
  });
});

describe("the blocklist", () => {
  it("shows each blocked pattern with who blocked it", async () => {
    const html = await page("settled");

    expect(html).toContain("spam.example");
    expect(html).toContain("Blocked by ann@firesio.app");
  });
});
