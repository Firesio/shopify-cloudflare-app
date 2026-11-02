import { describe, expect, it } from "vitest";
import { renderRoute } from "~/test/render-route";
import { campaignFixture, previewFixture } from "~/test/campaign-views";
import { buttonNamed, controlLabelled, definitionOf, isDisabled, tagWithId, textareaValue } from "~/test/html-queries";
import CampaignDetail from "./detail";
import NewCampaign from "./new";

/** The editor, rendered through the real SSR path: a saved draft (three steps, the third reading the saved version) and the empty "new" page. */
const savedDraft = (overrides: Parameters<typeof campaignFixture>[0] = {}, preview = previewFixture()) =>
  renderRoute({
    path: "/internal/campaigns/campaign-1",
    Component: CampaignDetail,
    loaderData: { actorEmail: "me@firesio.app", screen: { kind: "draft", campaign: campaignFixture(overrides), preview } },
    stage: "pending",
  });

describe("a saved draft", () => {
  it("is three clear steps, in order", async () => {
    const html = await savedDraft();
    const titles = ["Step 1: Write it", "Step 2: Choose who gets it", "Step 3: Review and send"];
    const positions = titles.map((title) => html.indexOf(title));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("fills each field with what was written, labelled", async () => {
    const html = await savedDraft();
    expect(controlLabelled(html, "Name")).toContain('value="Big update"');
    expect(controlLabelled(html, "Subject")).toContain('value="A big update is coming"');
    expect(controlLabelled(html, "Button label (optional)")).toContain('value="See what is new"');
    expect(controlLabelled(html, "Button link (optional)")).toContain('value="https://firesio.app/news"');
    expect(textareaValue(html, "campaign-body")).toContain("Next week we ship a redesigned dashboard.");
  });

  it("shows each field's character count against its own limit, beside its label", async () => {
    const html = await savedDraft({ name: "Big update", subject: "A big update is coming" });
    expect(html).toMatch(/for="campaign-name"[^>]*>Name<\/label><span[^>]*>10 \/ 100<\/span>/);
    expect(html).toMatch(/for="campaign-subject"[^>]*>Subject<\/label><span[^>]*>22 \/ 150<\/span>/);
    expect(html).toMatch(/for="campaign-body"[^>]*>Message<\/label><span[^>]*>\d+ \/ 5,000<\/span>/);
  });

  it("counts who gets it as a sum a person can check, and names a few of them", async () => {
    const html = await savedDraft();
    expect(definitionOf(html, "Shops that match")).toBe("12");
    expect(definitionOf(html, "Without an email address")).toBe("1");
    expect(definitionOf(html, "Unsubscribed")).toBe("2");
    expect(html).toMatch(/<p[^>]*>9<\/p><p[^>]*>shops will receive it<\/p>/);
    expect(html).toContain("Alpha Goods");
    expect(html).toContain("beta@firesio.app");
  });

  it("offers the three audiences with the saved one chosen, and the install dates filled in", async () => {
    const html = await savedDraft({ audience: { kind: "dev", installedAfter: Date.UTC(2026, 0, 15), installedBefore: null } });
    expect(html).toContain('name="audienceKind" value="dev"');
    expect(tagWithId(html, "audience-dev")).toContain('aria-checked="true"');
    expect(tagWithId(html, "audience-real")).toContain('aria-checked="false"');
    expect(tagWithId(html, "audience-all")).toContain('aria-checked="false"');
    expect(controlLabelled(html, "On or after")).toContain('value="2026-01-15"');
    expect(controlLabelled(html, "Before")).not.toMatch(/value="[^"]+"/);
  });

  it("reviews the saved draft: its subject, who it goes to in words, and the exact number to send to", async () => {
    const html = await savedDraft({ audience: { kind: "real", installedAfter: Date.UTC(2026, 0, 15), installedBefore: null } });
    expect(html).toContain("Real stores only (development stores left out)");
    expect(html).toContain("Installed on or after");
    expect(buttonNamed(html, "Send to 9 shops")).toBeDefined();
    expect(isDisabled(buttonNamed(html, "Send to 9 shops") ?? "")).toBe(false);
    expect(buttonNamed(html, "Send me a test")).toBeDefined();
    expect(html).toContain("The test goes to me@firesio.app only. Sending reaches 9 shops.");
  });

  it("will not send to nobody, and says what to do", async () => {
    const html = await savedDraft({}, previewFixture({ matched: 0, withoutAddress: 0, unsubscribed: 0, recipients: 0, sample: [] }));
    expect(isDisabled(buttonNamed(html, "Send to 0 shops") ?? "")).toBe(true);
    expect(html).toContain("Nobody would receive this. Choose a wider audience in step 2 and save.");
  });

  it("can be deleted, and saved without sending", async () => {
    const html = await savedDraft();
    expect(buttonNamed(html, "Delete draft")).toBeDefined();
    expect(buttonNamed(html, "Save changes")).toBeDefined();
    expect(html).toContain("Saving does not send anything.");
  });
});

describe("the new campaign page", () => {
  const html = () =>
    renderRoute({ path: "/internal/campaigns/new", Component: NewCampaign, loaderData: { actorEmail: "me@firesio.app", preview: previewFixture() }, stage: "pending" });

  it("starts empty, with the default audience counted", async () => {
    const page = await html();
    expect(controlLabelled(page, "Name")).not.toMatch(/value="[^"]+"/);
    expect(tagWithId(page, "audience-real")).toContain('aria-checked="true"');
    expect(definitionOf(page, "Shops that match")).toBe("12");
    expect(page).toContain("Counted for the default audience.");
  });

  it("asks for a save before anything can be tested or sent, and has no delete", async () => {
    const page = await html();
    expect(page).toContain("Save the draft first.");
    expect(buttonNamed(page, "Save draft")).toBeDefined();
    expect(buttonNamed(page, "Send me a test")).toBeUndefined();
    expect(page).not.toMatch(/Send to \d+ shops/);
    expect(buttonNamed(page, "Delete draft")).toBeUndefined();
  });
});
