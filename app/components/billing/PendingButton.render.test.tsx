import { describe, expect, it } from "vitest";
import { renderRoute } from "~/test/render-route";
import { PendingButton } from "./PendingButton";

const render = (chars: number) =>
  renderRoute({ path: "/x", Component: () => <PendingButton chars={chars} />, loaderData: {}, stage: "pending" });

describe("PendingButton", () => {
  it("is the real primary button, disabled, marked as a skeleton, hidden from assistive technology and not spinning", async () => {
    const html = await render(5);
    expect(html).toContain('<s-button data-skeleton="" variant="primary" disabled="">');
    expect(html).toContain('accessibilityVisibility="hidden"');
    expect(html).not.toMatch(/\sloading/);
    expect(html).not.toMatch(/\d+px/);
  });

  it("holds as many figure spaces as the label it stands for has characters", async () => {
    expect(await render(7)).toContain(`>${" ".repeat(7)}</s-button>`);
  });
});
