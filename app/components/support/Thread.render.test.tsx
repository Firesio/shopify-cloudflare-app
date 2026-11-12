import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Thread, type ThreadMessage } from "./Thread";

const message = (over: Partial<ThreadMessage> = {}): ThreadMessage => ({
  id: "message_1",
  author: "merchant",
  authorName: "Store",
  body: "",
  createdAt: 1,
  asksReview: false,
  attachments: [],
  ...over,
});

const reviewLink = { prompt: "We value your feedback.", label: "Review the app", onRequest: () => undefined };

const render = (messages: ThreadMessage[] | "loading", link?: typeof reviewLink) =>
  renderToStaticMarkup(
    <Thread
      reviewLink={link}
      formatFileSize={(sizeBytes) => `${Math.max(1, Math.round(sizeBytes / 1024))} KB`}
      formatWhen={() => "now"}
      youLabel="You"
      messages={messages}
    />,
  );

describe("Thread", () => {
  it("shows a CSV attachment as a downloadable file with its extension and size", () => {
    const html = render([
      message({ attachments: [{ id: "attachment_1", filename: "orders.csv", contentType: "text/csv", sizeBytes: 2048, url: "/support/file/attachment_1", kind: "file" }] }),
    ]);

    expect(html).toContain("CSV");
    expect(html).toContain("orders.csv");
    expect(html).toContain("2 KB");
    expect(html).toContain('download="orders.csv"');
    expect(html).toContain('href="/support/file/attachment_1"');
  });

  it("opens an image full size in a new tab and describes it by its filename", () => {
    const html = render([
      message({ attachments: [{ id: "a", filename: "shot.png", contentType: "image/png", sizeBytes: 10, url: "/support/file/a", kind: "image" }] }),
    ]);

    expect(html).toMatch(/<s-clickable[^>]*href="\/support\/file\/a"[^>]*target="_blank"/);
    expect(html).toMatch(/<s-image[^>]*alt="shot.png"/);
  });

  it("plays a video in place with the browser's own controls", () => {
    const html = render([
      message({ attachments: [{ id: "v", filename: "bug.mp4", contentType: "video/mp4", sizeBytes: 10, url: "/support/file/v", kind: "video" }] }),
    ]);
    expect(html).toMatch(/<video[^>]*src="\/support\/file\/v"[^>]*controls/);
  });

  it("tints the merchant's own messages and names the other side by their name", () => {
    const html = render([message({ body: "mine" }), message({ id: "m2", author: "staff", authorName: "Sam", body: "ours" })]);

    expect(html).toMatch(/<s-box background="subdued"[^>]*>[\s\S]*You[\s\S]*mine/);
    expect(html).toMatch(/<s-box background="base"[^>]*>[\s\S]*Sam[\s\S]*ours/);
  });

  it("keeps a message's line breaks as paragraphs, and renders an empty body as no paragraphs", () => {
    const html = render([message({ body: "a\n\nb" }), message({ id: "m2", body: "" })]);
    expect(html.match(/<s-paragraph>/g)).toHaveLength(2);
  });

  it("uses no hand-written styling", () => {
    const html = render([message({ body: "x" })]);
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<div");
    expect(html).not.toMatch(/style=|class=/);
  });

  it("while loading draws three message boxes of skeletons in the same frame, with no words and nothing announced", () => {
    const html = render("loading");

    expect(html.match(/<s-box background="(subdued|base)" border="base"/g)).toHaveLength(3);
    expect(html).toContain('data-skeleton=""');
    expect(html).not.toContain("<s-paragraph");
    expect(html).not.toContain("You");
    expect(html).not.toContain("role=");
    expect(html).not.toContain("accessibilityRole");
  });

  it("frames a loaded message with the same box, stack and header row as a loading one", () => {
    const loaded = render([message({ body: "x" })]);
    const loading = render("loading");
    const count = (html: string, tag: string) => (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;

    // One loading box has the box, its block stack and the author/time row; the loaded one has the same three.
    expect(loaded).toMatch(/^<s-stack direction="block" gap="base"><s-box background="subdued" border="base" borderRadius="base" padding="base"><s-stack direction="block" gap="small"><s-stack direction="inline" gap="small-300" alignItems="baseline">/);
    expect(loading).toMatch(/^<s-stack direction="block" gap="base"><s-box background="subdued" border="base" borderRadius="base" padding="base"><s-stack direction="block" gap="small"><s-stack direction="inline" gap="small-300" alignItems="baseline">/);
    expect(count(loaded, "s-box")).toBe(1);
  });

  it("shows the review link under a staff message that asks for one, and only there", () => {
    const html = render(
      [
        message({ id: "asks", author: "staff", authorName: "Support", body: "Fixed.", asksReview: true }),
        message({ id: "plain", author: "staff", authorName: "Support", body: "Anything else?" }),
        message({ id: "theirs", author: "merchant", body: "Thanks", asksReview: true }),
      ],
      reviewLink,
    );

    expect(html.match(/Review the app/g)).toHaveLength(1);
    // A button that asks Shopify for its modal, not a link out of the admin.
    expect(html).toMatch(/<s-button[^>]*>Review the app<\/s-button>/);
    expect(html).not.toMatch(/<s-button[^>]*href=[^>]*>Review the app/);
    expect(html.indexOf("Fixed.")).toBeLessThan(html.indexOf("Review the app"));
    expect(html.indexOf("Review the app")).toBeLessThan(html.indexOf("Anything else?"));
  });

  it("shows no review link when the app has no listing yet, even if the message asks", () => {
    const html = render([message({ author: "staff", authorName: "Support", body: "Fixed.", asksReview: true })]);

    expect(html).not.toContain("Review the app");
  });
});
