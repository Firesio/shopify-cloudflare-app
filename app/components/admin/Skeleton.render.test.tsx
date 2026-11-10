import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { renderRoute } from "~/test/render-route";
import { SkeletonBadge, SkeletonBlock, SkeletonLines, SkeletonStatus, SkeletonText } from "./Skeleton";

const render = (element: ReactElement) => renderRoute({ path: "/x", Component: () => element, loaderData: {}, stage: "pending" });
const FIGURE_SPACE = " ";

describe("skeleton pieces", () => {
  it("makes a text bar from a real s-text holding as many figure spaces as asked, hidden from assistive technology", async () => {
    const html = await render(<SkeletonText chars={6} type="strong" />);
    expect(html).toContain(`<s-text type="strong">${FIGURE_SPACE.repeat(6)}</s-text>`);
    expect(html).toContain('accessibilityVisibility="hidden"');
    expect(html).toContain('data-skeleton=""');
    expect(html).not.toMatch(/\d+px/);
  });

  it("uses a real s-heading for a heading-sized value", async () => {
    expect(await render(<SkeletonText heading chars={4} />)).toContain(`<s-heading>${FIGURE_SPACE.repeat(4)}</s-heading>`);
  });

  it("makes N lines, the last one shorter, and never a pixel height", async () => {
    const html = await render(<SkeletonLines lines={4} />);
    expect(html.match(/data-skeleton=""/g)).toHaveLength(4);
    expect(html.match(/inlineSize="60%"/g)).toHaveLength(1);
    expect(html).not.toMatch(/blockSize/);
  });

  it("makes a badge from a real neutral s-badge", async () => {
    const html = await render(<SkeletonBadge chars={3} />);
    expect(html).toContain('<s-badge data-skeleton="" tone="neutral">');
  });

  it("sizes a block in pixels, for an image of fixed size", async () => {
    const html = await render(<SkeletonBlock width={80} height={48} />);
    expect(html).toContain('inlineSize="80px"');
    expect(html).toContain('blockSize="48px"');
  });

  it("announces a wait through one visually hidden status", async () => {
    const html = await render(<SkeletonStatus label="Loading plans" />);
    expect(html).toContain('accessibilityRole="status"');
    expect(html).toContain('accessibilityVisibility="exclusive"');
    expect(html).toContain("Loading plans");
  });
});
