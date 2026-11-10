import { describe, expect, it } from "vitest";
import { err, ok } from "~/lib/result";
import { renderRoute } from "~/test/render-route";
import Index from "./home";

const DOMAIN = "acme.myshopify.com";
const never = new Promise<never>(() => undefined);

const home = (shopName: Promise<unknown>, stage: "pending" | "settled") =>
  renderRoute({ path: "/app", Component: Index, loaderData: { shopDomain: DOMAIN, shopName }, stage });

describe("streaming the home greeting", () => {
  it("renders the page frame and a correct greeting with the shop domain while the name is pending", async () => {
    const html = await home(never, "pending");

    expect(html).toContain("<s-page");
    expect(html).toContain('heading="Home"');
    expect(html).toContain(`Hello, ${DOMAIN}`);
    expect(html).not.toContain("Good morning");
    expect(html).not.toContain("<s-spinner");
  });

  it("keeps every direct child of the page a section, the help line included", async () => {
    const html = await home(never, "pending");
    const page = html.slice(html.indexOf("<s-page"), html.indexOf("</s-page>"));
    expect(page).toContain("Need help?");
    // The help line is inside a section, never loose in the page.
    expect(page.slice(page.lastIndexOf("<s-section"), page.indexOf("Need help?"))).not.toContain("</s-section>");
  });

  it("swaps in the shop name once it arrives", async () => {
    const html = await home(Promise.resolve(ok("Acme Store")), "settled");
    expect(html).toContain("Acme Store");
  });

  it("keeps the domain greeting when the name could not be read", async () => {
    const html = await home(Promise.resolve(err("failed")), "settled");
    expect(html).toContain(DOMAIN);
    expect(html).not.toContain('tone="critical"');
  });
});
