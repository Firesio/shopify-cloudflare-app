import { describe, expect, it } from "vitest";
import { loader } from "./unsubscribe";

/** The route called directly: the end-to-end build wraps a resource route's response, so its headers are read here, where nothing wraps them. */
describe("the campaign unsubscribe route's loader", () => {
  it("answers a GET with the button page, never cached and not indexed, and changes nothing", async () => {
    const request = new Request("https://example.test/campaigns/unsubscribe?e=someone%40example.org&c=forged&s=forged");
    const response = await loader({ request });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    const html = await response.text();
    expect(html).toContain('method="post"');
    expect(html).not.toContain("someone@example.org");
  });
});
