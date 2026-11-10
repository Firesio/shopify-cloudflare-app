import { describe, expect, it } from "vitest";
import { PLANS } from "~/billing/plans";
import { renderRoute } from "~/test/render-route";
import { PlanCard } from "./PlanCard";

const render = (props: Partial<Parameters<typeof PlanCard>[0]> = {}) =>
  renderRoute({
    path: "/plans",
    Component: () => <PlanCard plan={PLANS.pro} buildsOn={PLANS.free} standing="other" isFeatured={false} {...props} />,
    loaderData: {},
    stage: "settled",
  });

describe("PlanCard", () => {
  it("is built from Polaris only: no style tag, no class, no hand-drawn markup", async () => {
    const html = await render();
    expect(html).not.toContain("<style");
    expect(html).not.toContain("class=");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<div");
  });

  it("names the plan with a heading", async () => {
    expect(await render()).toContain(`<s-heading>${PLANS.pro.name}</s-heading>`);
  });

  it("picks the illustration by the plan's handle, with translated alt text", async () => {
    const pro = await render({ plan: PLANS.pro });
    expect(pro).toContain('src="/plan-cards/lv2.svg"');
    expect(pro).toContain('alt="Illustration for the paid plan"');

    const free = await render({ plan: PLANS.free, buildsOn: null });
    expect(free).toContain('src="/plan-cards/lv1.svg"');
    expect(free).toContain('alt="Illustration for the free plan"');
  });

  it("shows the name, the price as the heaviest text, and what the plan adds", async () => {
    const html = await render();
    expect(html).toContain(PLANS.pro.name);
    expect(html).toMatch(/<s-text[^>]*fontSize="large-100"[^>]*fontWeight="bold"[^>]*>\$19\.00/);
    expect(html).toContain("Everything in");
    expect(html.match(/<s-icon type="check"/g)).toHaveLength(PLANS.pro.featureKeys.length);
  });

  it("marks the current plan with a success badge and a stronger border, and nothing else", async () => {
    const html = await render({ standing: "current", isFeatured: true });
    expect(html).toContain('tone="success"');
    expect(html).toContain('border="large"');
    expect(html).not.toContain("Most popular");
  });

  it("marks the featured plan only when it is not the current one", async () => {
    expect(await render({ isFeatured: true })).toContain("Most popular");
    expect(await render({ isFeatured: false })).not.toContain("<s-badge");
  });

  it("keeps the badge in the plan name's row, so a badge arriving moves nothing", async () => {
    const html = await render({ standing: "current" });
    expect(html).toMatch(/<s-heading>[^<]*<\/s-heading><s-badge[^>]*>Current plan<\/s-badge>/);
  });

  describe("while the subscription is unknown", () => {
    it("renders every static part as the real thing and only the badge as a skeleton", async () => {
      const html = await render({ standing: "loading", isFeatured: true });
      expect(html).toContain(`<s-heading>${PLANS.pro.name}</s-heading>`);
      expect(html).toMatch(/<s-text[^>]*fontSize="large-100"[^>]*>\$19\.00/);
      expect(html).toContain("Everything in");
      expect(html.match(/<s-icon type="check"/g)).toHaveLength(PLANS.pro.featureKeys.length);
      expect(html.match(/<s-badge data-skeleton=""/g)).toHaveLength(1);
      expect(html).not.toContain("Current plan");
      expect(html).not.toContain("Most popular");
      expect(html).not.toContain("s-spinner");
    });

    it("has the loaded card's structure: the same headings, rows and icons", async () => {
      const count = (html: string, tag: string) => html.match(new RegExp(`<${tag}[ >]`, "g"))?.length ?? 0;
      const pending = await render({ standing: "loading", isFeatured: true });
      const loaded = await render({ standing: "other", isFeatured: true });
      for (const tag of ["s-heading", "s-badge", "s-icon", "s-image", "s-divider", "s-text"]) {
        expect(count(pending, tag), tag).toBe(count(loaded, tag));
      }
    });
  });

  it("gives the free plan no per-month label", async () => {
    const html = await render({ plan: PLANS.free, buildsOn: null });
    expect(html).not.toMatch(/per month/i);
    expect(html).not.toContain("Everything in");
  });
});
