import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { audienceTextForRequest } from "~/wiring/audience.server";
import { runWithRequestContext } from "~/request-context.server";
import { getLanguage, requestEvidence } from "./i18n.server";

describe("one negotiation per request", () => {
  it("reads the request's language evidence once, however many times the page and its texts ask", async () => {
    const request = new Request("https://example.test/pricing", { headers: { "Accept-Language": "es" } });
    const read = vi.spyOn(request.headers, "get");
    const results = await runWithRequestContext(env, async () => {
      const first = await getLanguage(request);
      const second = await getLanguage(request);
      const text = await audienceTextForRequest(request, "public.pricing");
      await requestEvidence(request);
      return [first, second, text.language.code];
    });
    expect(results).toEqual(["es", "es", "es"]);
    expect(read.mock.calls.filter(([name]) => name === "Accept-Language")).toHaveLength(1);
  });

  it("is per request: another request reads its own evidence", async () => {
    const one = await runWithRequestContext(env, () => getLanguage(new Request("https://example.test/", { headers: { "Accept-Language": "es" } })));
    const two = await runWithRequestContext(env, () => getLanguage(new Request("https://example.test/", { headers: { "Accept-Language": "en" } })));
    expect([one, two]).toEqual(["es", "en"]);
  });
});
