import { pageOnEverySurface } from "@firesio/app/ui/surface/testing";
import { describe, expect, it } from "vitest";
import { HomeView } from "~/components/HomeView";

describe("the home page on every surface", () => {
  it("has its one action on the web admin, in Shopify POS and on the phone", async () => {
    const page = await pageOnEverySurface(<HomeView shop="a.myshopify.com" plan="Free" permissions={["app:view"]} />);
    // The web admin draws it in the page's header slot; POS draws it in its one bar; the phone app draws the header slots until the app plugs a renderer in.
    expect(page.admin.actions).toEqual([{ label: "Contact support", place: "header", primary: true }]);
    expect(page.pos.actions.map((action) => [action.label, action.place])).toEqual([["Contact support", "bar"]]);
    expect(page.pwa.actions.map((action) => action.label)).toEqual(["Contact support"]);
  });
});
