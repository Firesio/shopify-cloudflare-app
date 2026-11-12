import { describe, expect, it } from "vitest";
import { err, ok } from "~/lib/result";
import { renderRoute } from "~/test/render-route";
import SupportThreadPage from "./detail";

const never = new Promise<never>(() => undefined);

const REPLY_KEY = "7b1f0e0a-3c43-4f0e-9d3e-5b4a6a1c2d3e";

const ticket = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  subject: "Checkout is broken",
  category: "bug",
  status: "open",
  createdAt: Date.parse("2026-08-25T00:00:00.000Z"),
  ccEmails: [],
  ...over,
});

const message = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  author: "merchant",
  authorName: "Acme",
  body: "Cannot pay",
  createdAt: 1,
  asksReview: false,
  attachments: [],
  ...over,
});

const thread = { ticket: ticket(), messages: [message()] };

const REVIEW_URL = "https://apps.shopify.com/example#modal-show=WriteReviewModal";

const detail = (value: Promise<unknown>, stage: "pending" | "settled", locale: "en" | "es" = "en", reviewUrl: string | null = null) =>
  renderRoute({ path: "/app/support/t1", Component: SupportThreadPage, loaderData: { thread: value, replyKey: REPLY_KEY, reviewUrl }, stage, locale });

const count = (html: string, pattern: string | RegExp) =>
  (html.match(typeof pattern === "string" ? new RegExp(`<${pattern}[\\s>]`, "g") : pattern) ?? []).length;

/** The Polaris elements render as inert tags, so these assert what the page decided, not how it looks. */
describe("streaming the ticket thread", () => {
  it("renders the frame, the way back, the composer and the details labels at once, with skeletons where the thread goes", async () => {
    const html = await detail(never, "pending");

    expect(html).toContain('<s-page heading="Ticket"');
    expect(html).toContain('slot="breadcrumb-actions"');
    expect(html).toContain('href="/app/support"');
    for (const heading of ["Conversation", "Your reply", "Details"]) expect(html).toContain(`heading="${heading}"`);
    for (const label of ["Status", "Type", "Opened"]) expect(html).toContain(`>${label}</s-text>`);
    expect(html).toContain('data-skeleton=""');
    expect(html).not.toContain("<s-spinner");
    expect(html).not.toContain("Cannot pay");
  });

  it("draws three message boxes, the merchant's own tinted, and no real message", async () => {
    const html = await detail(never, "pending");

    expect(count(html, /<s-box background="subdued" border="base"/g)).toBe(2);
    expect(count(html, /<s-box background="base" border="base"/g)).toBe(1);
    expect(count(html, "s-paragraph")).toBe(0);
  });

  it("holds the composer still: a disabled text box, drop zone and send button, none of which can submit", async () => {
    const html = await detail(never, "pending");

    expect(html).toMatch(/<s-text-area[^>]*name="body"[^>]*disabled/);
    expect(html).toMatch(/<s-drop-zone[^>]*disabled/);
    expect(html).toMatch(/<s-button type="submit"[^>]*disabled[^>]*>Send reply<\/s-button>/);
    // Whether the ticket is closed is not known yet, so nothing about reopening is claimed.
    expect(html).not.toContain("reopen");
  });

  it("does not claim nobody is copied while the copy list is unknown, and submits no list", async () => {
    const html = await detail(never, "pending");

    expect(html).not.toContain("No one else is copied.");
    expect(html).not.toContain('name="ccEmails"');
    expect(html).toContain("Add email");
    expect(html).toMatch(/<s-button[^>]*disabled[^>]*>Add email<\/s-button>/);
  });

  it("announces the wait once for the whole page", async () => {
    const html = await detail(never, "pending");

    expect(count(html, /accessibilityRole="status"/g)).toBe(1);
    expect(count(html, /Loading the conversation/g)).toBe(1);
  });

  it("keeps the footprint of the loaded page: the same sections, composer, details fields and message boxes", async () => {
    const loading = await detail(never, "pending");
    const loaded = await detail(
      Promise.resolve(ok({ ticket: ticket(), messages: [message({ id: "a" }), message({ id: "b", author: "staff", authorName: "Sam" }), message({ id: "c" })] })),
      "settled",
    );

    for (const tag of ["s-page", "s-section", "s-text-area", "s-drop-zone", "s-divider", "s-badge", "s-email-field"]) {
      expect(count(loading, tag), tag).toBe(count(loaded, tag));
    }
    expect(count(loading, /<s-box background="(subdued|base)" border="base"/g)).toBe(count(loaded, /<s-box background="(subdued|base)" border="base"/g));
    expect(count(loading, /<s-button type="submit"/g)).toBe(count(loaded, /<s-button type="submit"/g));
    expect(loaded).not.toContain("data-skeleton");
    expect(loaded).not.toContain('accessibilityRole="status"');
  });

  it("shows the subject as the heading and the conversation once it arrives", async () => {
    const html = await detail(Promise.resolve(ok(thread)), "settled");

    expect(html).toContain('<s-page heading="Checkout is broken"');
    expect(html).toContain("Cannot pay");
  });

  it("says the ticket was not found, instead of an empty thread, when the shop has no such ticket", async () => {
    const html = await detail(Promise.resolve(ok(null)), "settled");

    expect(html).toContain("We couldn&#x27;t find this ticket");
    expect(html).toContain('href="/app/support"');
    expect(html).not.toContain("Cannot pay");
  });

  it("shows a critical banner when the thread could not be loaded", async () => {
    const html = await detail(Promise.resolve(err("failed")), "settled");

    expect(html).toContain('tone="critical"');
    expect(html).toContain("We couldn&#x27;t load your tickets");
    expect(html).toContain('href="/app/support"');
    // The failure replaces the skeletons: no pending announcement, no composer for a thread that did not load.
    expect(html).not.toContain("data-skeleton");
    expect(html).not.toContain('accessibilityRole="status"');
    expect(html).not.toContain("<s-text-area");
  });

  it("translates the pending copy and the real labels around it", async () => {
    const html = await detail(never, "pending", "es");
    expect(html).toContain("Cargando la conversación");
    expect(html).not.toContain("Loading the conversation");
    expect(html).not.toContain('heading="Conversation"');
  });
});

describe("the reply composer", () => {
  it("offers a text box, the file picker and a send button on an open ticket", async () => {
    const html = await detail(Promise.resolve(ok(thread)), "settled");

    expect(html).toMatch(/<s-text-area[^>]*name="body"/);
    expect(html).toContain("<s-drop-zone");
    expect(html).toContain('name="uploadIds"');
    expect(html).toContain("Send reply");
    expect(html).not.toContain("reopen");
  });

  it("identifies the message with the key the loader made, so a double click stores it once", async () => {
    const html = await detail(Promise.resolve(ok(thread)), "settled");
    expect(html).toMatch(new RegExp(`<input[^>]*name="submissionKey"[^>]*value="${REPLY_KEY}"`));
  });

  it("still offers the composer on a CLOSED ticket, says replying reopens it, and keeps the status visible", async () => {
    const html = await detail(Promise.resolve(ok({ ticket: ticket({ status: "closed" }), messages: [message()] })), "settled");

    expect(html).toMatch(/<s-text-area[^>]*name="body"/);
    expect(html).toContain("This ticket is closed. Replying will reopen it.");
    expect(html).toContain("Send reply and reopen");
    // The status badge in the details column still reads Closed.
    expect(html).toMatch(/<s-badge tone="neutral">Closed<\/s-badge>/);
    // The old copy promised a reopen without offering a way to do it.
    expect(html).not.toContain("Reply to reopen it");
  });

  it("says the same in Spanish", async () => {
    const html = await detail(Promise.resolve(ok({ ticket: ticket({ status: "closed" }), messages: [message()] })), "settled", "es");
    expect(html).toContain("Este ticket está cerrado. Si respondes, se reabrirá.");
    expect(html).toContain("Enviar respuesta y reabrir");
  });
});

describe("the conversation", () => {
  const withFiles = {
    ticket: ticket(),
    messages: [
      message({
        id: "m1",
        body: "Line one\nLine two",
        attachments: [
          { id: "a1", filename: "shot.png", contentType: "image/png", url: "/support/file/a1?token=x", sizeBytes: 2048, kind: "image" },
          { id: "a2", filename: "orders.csv", contentType: "text/csv", url: "/support/file/a2?token=x", sizeBytes: 3 * 1024 * 1024, kind: "file" },
        ],
      }),
      message({ id: "m2", author: "staff", authorName: "Sam", body: "On it" }),
    ],
  };

  it("builds every message from Polaris parts, with no stylesheet or hard-coded colour", async () => {
    const html = await detail(Promise.resolve(ok(withFiles)), "settled");

    expect(html).not.toContain("<style");
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain("prefers-color-scheme");
    expect(html).toContain("<s-box");
    expect(html).not.toContain("<div");
  });

  it("shows each line of a message as its own paragraph and names who spoke", async () => {
    const html = await detail(Promise.resolve(ok(withFiles)), "settled");

    expect(html).toContain("<s-paragraph>Line one</s-paragraph>");
    expect(html).toContain("<s-paragraph>Line two</s-paragraph>");
    expect(html).toContain(">You</s-text>");
    expect(html).toContain(">Sam</s-text>");
  });

  it("shows an image as a linked image and a file as a download with its size", async () => {
    const html = await detail(Promise.resolve(ok(withFiles)), "settled");

    expect(html).toMatch(/<s-image[^>]*src="\/support\/file\/a1\?token=x"[^>]*alt="shot.png"/);
    expect(html).toMatch(/<s-link[^>]*href="\/support\/file\/a2\?token=x"[^>]*download="orders.csv"/);
    expect(html).toContain("CSV");
    expect(html).toContain("3 MB");
  });

  it("formats the file size in the reader's language", async () => {
    const html = await detail(Promise.resolve(ok({ ticket: ticket(), messages: [message({ attachments: [{ id: "a", filename: "v.csv", contentType: "text/csv", url: "/u", sizeBytes: 1.5 * 1024 * 1024, kind: "file" }] })] })), "settled", "es");
    expect(html).toContain("1,5 MB");
  });
});

describe("asking the merchant for an app review", () => {
  const asked = { ticket: ticket(), messages: [message({ author: "staff", authorName: "Support", body: "All fixed.", asksReview: true })] };

  it("shows the review link under the staff message that asked for it", async () => {
    const html = await detail(Promise.resolve(ok(asked)), "settled", "en", REVIEW_URL);

    // A button (it asks Shopify for its review modal when pressed), not a link out of the admin.
    expect(html).toMatch(/<s-button[^>]*>Review the app<\/s-button>/);
    expect(html).not.toMatch(/<s-button[^>]*href=[^>]*>Review the app/);
    expect(html.indexOf("All fixed.")).toBeLessThan(html.indexOf("Review the app"));
  });

  it("says it in the merchant's language", async () => {
    const html = await detail(Promise.resolve(ok(asked)), "settled", "es", REVIEW_URL);

    expect(html).toContain("Valorar la app");
  });

  it("shows nothing before the app has a listing, however the message was sent", async () => {
    const html = await detail(Promise.resolve(ok(asked)), "settled", "en", null);

    expect(html).not.toContain("Review the app");
    expect(html).toContain("All fixed.");
  });
});
