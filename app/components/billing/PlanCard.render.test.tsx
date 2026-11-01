import { describe, expect, it } from "vitest";
import { PLANS } from "~/billing/plans";
import { renderRoute } from "~/test/render-route";
import { PlanCard } from "./PlanCard";

const render = (props: Partial<Parameters<typeof PlanCard>[0]> = {}) =>
  renderRoute({
    path: "/plans",
    Component: () => <PlanCard plan={PLANS.pro} buildsOn={PLANS.free} isCurrent={false} isFeatured={false} {...props} />,
    loaderData: {},
    stage: "settled",
  });

describe("PlanCard", () => {
  it("is built from Polaris only: no style tag, no class, no hand-drawn markup", async () => {
    const html = await render({ illustrationSrc: "/plan-cards/lv2.svg", illustrationAlt: "Level two" });
    expect(html).not.toContain("<style");
    expect(html).not.toContain("class=");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<div");
  });

  it("shows the name, the price as the heaviest text, and what the plan adds", async () => {
    const html = await render();
    expect(html).toContain(PLANS.pro.name);
    expect(html).toMatch(/<s-text[^>]*fontSize="large-100"[^>]*fontWeight="bold"[^>]*>\$19\.00/);
    expect(html).toContain("Everything in");
    expect(html.match(/<s-icon type="check"/g)).toHaveLength(PLANS.pro.featureKeys.length);
  });

  it("marks the current plan with a success badge and a stronger border, and nothing else", async () => {
    const html = await render({ isCurrent: true, isFeatured: true });
    expect(html).toContain('tone="success"');
    expect(html).toContain('border="large"');
    expect(html).not.toContain("Most popular");
  });

  it("marks the featured plan only when it is not the current one", async () => {
    expect(await render({ isFeatured: true })).toContain("Most popular");
    expect(await render({ isFeatured: false })).not.toContain("<s-badge");
  });

  it("gives the free plan no per-month label", async () => {
    const html = await render({ plan: PLANS.free, buildsOn: null });
    expect(html).not.toMatch(/per month/i);
    expect(html).not.toContain("Everything in");
  });
});
