import { describe, expect, it } from "vitest";
import { renderRoute } from "~/test/render-route";
import { campaignFixture, recipientFixture } from "~/test/campaign-views";
import { buttonNamed, definitionOf, tagWithAttribute } from "~/test/html-queries";
import type { RecipientCounts } from "~/domain/campaign-delivery";
import type { Campaign, CampaignRecipient, RecipientStatus } from "~/ports/campaigns";
import CampaignDetail from "./detail";

/** The progress report, rendered through the real SSR path for each state a started campaign can be in. */
interface Scenario {
  readonly campaign?: Partial<Campaign>;
  readonly counts?: RecipientCounts;
  readonly recipients?: readonly CampaignRecipient[];
  readonly recipientStatus?: RecipientStatus | null;
}

const COUNTS: RecipientCounts = { pending: 6, sent: 3, failed: 1, refused: 0, skipped: 0 };
const STARTED = Date.UTC(2026, 10, 3, 8, 0);

const report = ({ campaign = {}, counts = COUNTS, recipients = [recipientFixture()], recipientStatus = null }: Scenario = {}) =>
  renderRoute({
    path: "/internal/campaigns/campaign-1",
    Component: CampaignDetail,
    loaderData: {
      actorEmail: "me@firesio.app",
      screen: {
        kind: "report",
        campaign: campaignFixture({ status: "sending", recipientCount: 10, startedAt: STARTED, lastPumpAt: STARTED + 60_000, ...campaign }),
        counts,
        recipients,
        recipientStatus,
        recipientLimit: 100,
      },
    },
    stage: "pending",
  });

describe("a campaign that is sending", () => {
  it("shows how far along it is, as a bar and as a percent of the people already handled", async () => {
    const html = await report();
    // 4 of 10 are no longer waiting.
    expect(html).toContain("4 of 10 handled");
    expect(tagWithAttribute(html, 'aria-label="Share of recipients handled"')).toContain('aria-valuenow="40"');
    expect(html).toMatch(/<span[^>]*>40%<\/span>/);
  });

  it("gives each of the five counts under its own label, with what it means", async () => {
    const html = await report();
    expect(definitionOf(html, "Sent")).toBe("3");
    expect(definitionOf(html, "Waiting")).toBe("6");
    expect(definitionOf(html, "Failed")).toBe("1");
    expect(definitionOf(html, "Refused")).toBe("0");
    expect(definitionOf(html, "Skipped")).toBe("0");
    expect(html).toContain("The provider rejected the address");
  });

  it("can be paused or cancelled, and says it is updating itself", async () => {
    const html = await report();
    expect(buttonNamed(html, "Pause")).toBeDefined();
    expect(buttonNamed(html, "Cancel campaign")).toBeDefined();
    expect(buttonNamed(html, "Resume")).toBeUndefined();
    expect(html).toContain("Updating every 5 seconds while this page is open.");
  });

  it("reads back the words that went out and who it was for, with when it started", async () => {
    const html = await report({ campaign: { audience: { kind: "all", installedAfter: Date.UTC(2026, 0, 1), installedBefore: null } } });
    expect(html).toContain("A big update is coming");
    expect(html).toContain("Nothing changes until you open it.");
    expect(html).toContain("Button “See what is new” opens ");
    expect(html).toContain("https://firesio.app/news");
    expect(html).toContain("Real and development stores");
    expect(html).toContain("Installed on or after");
    expect(definitionOf(html, "Created by")).toBe("writer@firesio.app");
    expect(definitionOf(html, "Started")).toMatch(/2026/);
    expect(html).toContain("10 shops, fixed when sending started");
  });

  it("offers no way back to editing: the words are read-only", async () => {
    const html = await report();
    expect(html).not.toContain('id="campaign-subject"');
    expect(html).not.toContain("Save changes");
  });
});

describe("a campaign that is paused", () => {
  it("explains a pause the system made, in plain words with what to do, and can be resumed", async () => {
    const html = await report({ campaign: { status: "paused", pauseReason: "high_failure_rate" } });
    expect(html).toContain("Paused automatically: most mails are being rejected");
    expect(html).toContain("fix the cause, then Resume");
    expect(buttonNamed(html, "Resume")).toBeDefined();
    expect(buttonNamed(html, "Pause")).toBeUndefined();
    expect(buttonNamed(html, "Cancel campaign")).toBeDefined();
    expect(html).not.toContain("Updating every");
  });

  it("explains a missing mail channel differently", async () => {
    const html = await report({ campaign: { status: "paused", pauseReason: "channel_unavailable" } });
    expect(html).toContain("Paused automatically: email sending is not set up");
    expect(html).not.toContain("most mails are being rejected");
  });

  it("has nothing to explain when a person paused it", async () => {
    const html = await report({ campaign: { status: "paused", pauseReason: null } });
    expect(html).not.toContain("Paused automatically");
    expect(buttonNamed(html, "Resume")).toBeDefined();
  });
});

describe("a campaign that is over", () => {
  it.each(["sent", "cancelled"] as const)("has no controls and no live updating once %s", async (status) => {
    const html = await report({ campaign: { status }, counts: { pending: 0, sent: 9, failed: 1, refused: 0, skipped: 0 } });
    for (const label of ["Pause", "Resume", "Cancel campaign"]) expect(buttonNamed(html, label)).toBeUndefined();
    expect(html).not.toContain("Updating every");
    expect(html).toMatch(/<span[^>]*>100%<\/span>/);
    expect(html).toContain("10 of 10 handled");
  });
});

describe("the recipients table", () => {
  it("shows a row per recipient: shop, address, status and the reason it failed, on the same row", async () => {
    const html = await report({
      recipients: [
        recipientFixture({ shop: "ok.myshopify.com", shopName: "Fine Store", email: "fine@firesio.app", status: "sent" }),
        recipientFixture({ shop: "bad.myshopify.com", shopName: "Bad Store", email: "bad@firesio.app", status: "failed", reasonCode: "mailbox_full", attempts: 3 }),
      ],
    });
    const rows = html.split("<tr");
    const bad = rows.find((row) => row.includes("Bad Store")) ?? "";
    expect(bad).toContain("bad.myshopify.com");
    expect(bad).toContain("bad@firesio.app");
    expect(bad).toContain("Failed");
    expect(bad).toContain("mailbox_full");
    expect(bad).not.toContain("Fine Store");
    expect((rows.find((row) => row.includes("Fine Store")) ?? "")).not.toContain("mailbox_full");
  });

  it("filters by status from tabs that carry each status's count, with the chosen one selected", async () => {
    const html = await report({ recipientStatus: "failed", recipients: [recipientFixture({ status: "failed", reasonCode: "bounced" })] });
    expect(html).toMatch(/aria-selected="true"[^>]*>Failed<span[^>]*>1<\/span>/);
    expect(html).toMatch(/aria-selected="false"[^>]*>Waiting<span[^>]*>6<\/span>/);
    expect(html).toMatch(/aria-selected="false"[^>]*>All<span[^>]*>10<\/span>/);
  });

  it("says when nobody has the chosen status, and when the table is cut short", async () => {
    expect(await report({ recipientStatus: "refused", recipients: [] })).toContain("Nobody with this status.");
    const many = Array.from({ length: 100 }, (_, index) => recipientFixture({ shop: `s${index}.myshopify.com`, shopName: `Shop ${index}` }));
    expect(await report({ recipients: many })).toContain("Showing the first 100 recipients.");
    expect(await report({ recipientStatus: "sent", recipients: many })).toContain("Showing the first 100 sent recipients.");
  });
});
