import { describe, expect, it } from "vitest";
import { renderRoute } from "~/test/render-route";
import { summaryFixture } from "~/test/campaign-views";
import Campaigns from "./index";

/**
 * The list page rendered through the real SSR path with a fixed loader result. The assertions tie each value to the row
 * it belongs to, so a number cannot pass by appearing elsewhere on the page.
 */
const render = (campaigns: ReturnType<typeof summaryFixture>[]) =>
  renderRoute({ path: "/internal/campaigns", Component: Campaigns, loaderData: { campaigns, limit: 100 }, stage: "pending" });

/** The text of the table row that contains `needle`. */
function rowWith(html: string, needle: string): string {
  const row = html.split("<tr").find((candidate) => candidate.includes(needle));
  if (row === undefined) throw new Error(`no row with ${needle}`);
  return row;
}

describe("the campaign list", () => {
  it("offers to start a campaign, from the toolbar", async () => {
    const html = await render([summaryFixture()]);
    expect(html).toMatch(/<a [^>]*href="\/internal\/campaigns\/new"[^>]*>.*New campaign/);
  });

  it("puts name, subject, status and recipients on the same row, and links the name to its page", async () => {
    const html = await render([
      summaryFixture({ id: "c-sent", name: "November news", subject: "What is new", status: "sent", recipientCount: 1234, createdByEmail: "kim@firesio.app" }),
      summaryFixture({ id: "c-draft", name: "Draft idea", subject: "Maybe later", status: "draft", recipientCount: null }),
    ]);
    const sent = rowWith(html, "November news");
    expect(sent).toContain('href="/internal/campaigns/c-sent"');
    expect(sent).toContain("What is new");
    expect(sent).toContain("Sent");
    expect(sent).toContain("1,234");
    expect(sent).toContain("kim@firesio.app");
    expect(sent).not.toContain("Not chosen yet");

    const draft = rowWith(html, "Draft idea");
    expect(draft).toContain("Draft");
    expect(draft).toContain("Not chosen yet");
    expect(draft).not.toContain("1,234");
  });

  it("says in plain words why a campaign is paused", async () => {
    const html = await render([summaryFixture({ name: "Stuck one", status: "paused", pauseReason: "channel_unavailable", recipientCount: 5 })]);
    const row = rowWith(html, "Stuck one");
    expect(row).toContain("Paused");
    expect(row).toContain("email sending is not set up");
  });

  it("shows an empty state that starts the first one, when there are none", async () => {
    const html = await render([]);
    expect(html).toContain("No campaigns yet");
    expect(html).toMatch(/href="\/internal\/campaigns\/new"[^>]*>(<svg.*?<\/svg>)?New campaign/);
  });

  it("says when older campaigns are not shown", async () => {
    const many = Array.from({ length: 100 }, (_, index) => summaryFixture({ id: `c-${index}`, name: `Campaign ${index}` }));
    expect(await render(many)).toContain("Showing the newest 100 campaigns.");
    expect(await render(many.slice(0, 3))).not.toContain("Showing the newest");
  });
});
