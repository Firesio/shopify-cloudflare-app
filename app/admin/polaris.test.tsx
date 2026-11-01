import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { EmbeddedProvider } from "~/components/admin/EmbeddedProvider";
import { renderRoute } from "~/test/render-route";
import { createShopify } from "~/shopify.server";
import pkg from "../../package.json";
import { POLARIS_URL } from "./polaris";

describe("the Polaris release", () => {
  it("is the stable Polaris 2 channel", () => {
    expect(POLARIS_URL).toBe("https://cdn.shopify.com/shopifycloud/polaris-2.js");
  });

  it("is preloaded by the server's document headers: the same release the provider runs", () => {
    const headers = new Headers();
    createShopify(env).addDocumentResponseHeaders(new Request("https://app.test/app?shop=shop-one.myshopify.com"), headers);
    expect(headers.get("Link")).toContain(`<${POLARIS_URL}>; rel="preload"; as="script"`);
  });

  it("is the only Polaris script the page loads", async () => {
    const html = await renderRoute({ path: "/app", Component: () => <EmbeddedProvider apiKey="key"><p>page</p></EmbeddedProvider>, loaderData: {}, stage: "settled" });
    expect(html).toContain(`src="${POLARIS_URL}"`);
    expect(html.match(/polaris[-0-9.]*\.js/g)).toEqual(["polaris-2.js"]);
  });

  it("has types of the same major version: they describe the components the page renders", () => {
    const major = /polaris-(\d+)(?:\.\d+)?\.js$/.exec(POLARIS_URL)?.[1];
    expect(major).toBe("2");
    expect(pkg.devDependencies["@shopify/polaris-types"]).toMatch(new RegExp(`^[\\^~]${major}\\.`));
  });
});
