import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SUPPORT_UPLOAD_PATH } from "~/core/paths";
import { setupTestDatabase } from "~/test/database";

setupTestDatabase();

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** A file posted the way the picker sends one (the raw body, its type and length, the filename header), with the given session token. */
const postFile = (token: string) =>
  exports.default.fetch(
    new Request(`https://example.test${SUPPORT_UPLOAD_PATH}`, {
      method: "POST",
      headers: { "user-agent": BROWSER, authorization: `Bearer ${token}`, "content-type": "image/png", "content-length": "4", "x-support-filename": "shot.png" },
      body: "abcd",
    }),
  );

async function stagedCount(): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM pending_uploads`).first();
  return typeof row?.["n"] === "number" ? row["n"] : -1;
}

/**
 * The staging route of the support file picker (`@firesio/app/ui/support/upload`, mounted at `paths.supportUpload`), through the real
 * Worker. It must sit behind the /app layout's middleware: an upload route reachable without Shopify's session would be free storage for
 * anyone. The route's own answers (staged, too large, wrong type) are the package's, tested there.
 */
describe("the support file staging route", () => {
  it("is behind the admin guard: a request naming a shop gets Shopify's session-token page, not the route's own 405", async () => {
    const response = await exports.default.fetch(new Request(`https://example.test${SUPPORT_UPLOAD_PATH}?shop=upload-shop.myshopify.com&host=abc&embedded=1`, { headers: { "user-agent": BROWSER }, redirect: "manual" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("app-bridge.js");
  });

  it("refuses a file with a session token Shopify did not sign (401) and stages nothing", async () => {
    const response = await postFile("not-a-session-token");
    expect(response.status).toBe(401);
    expect(await stagedCount()).toBe(0);
    expect((await env.UPLOADS.list()).objects).toEqual([]);
  });
});
