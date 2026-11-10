import { describe, expect, it } from "vitest";
import { renderRoute } from "~/test/render-route";
import { SetupGuide } from "./SetupGuide";

const render = (locale: "en" | "es" = "en") => renderRoute({ path: "/x", Component: SetupGuide, loaderData: {}, locale, stage: "pending" });

describe("SetupGuide (template placeholder)", () => {
  it("states progress computed from its steps, formatted by the language", async () => {
    expect(await render("en")).toContain("1 of 3 steps completed");
    expect(await render("es")).toContain("1 de 3 pasos completados");
  });

  it("opens the first step still to do, not the finished one", async () => {
    const html = await render();
    const displays = [...html.matchAll(/paddingBlockStart="none" display="(auto|none)"/g)].map((match) => match[1]);
    expect(displays).toEqual(["none", "auto", "none"]);
  });

  it("names the step in each toggle's accessible label", async () => {
    const html = await render();
    expect(html).toContain('accessibilityLabel="Toggle details of Add your first products"');
    expect(html).toContain('accessibilityLabel="Toggle details of Check your first report"');
  });
});
