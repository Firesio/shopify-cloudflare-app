import { describe, expect, it } from "vitest";
import { loader } from "./healthz";

describe("/healthz", () => {
  it("answers 200 while D1 and KV answer, never cached, and says nothing about any shop", async () => {
    const response = await loader({ request: new Request("https://example.test/healthz") });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body: unknown = await response.json();
    expect(body).toMatchObject({ ok: true });
    expect(JSON.stringify(body)).not.toContain("myshopify.com");
  });

  it("answers GET and HEAD only", async () => {
    const response = await loader({ request: new Request("https://example.test/healthz", { method: "POST" }) });
    expect(response.status).toBe(405);
  });
});
