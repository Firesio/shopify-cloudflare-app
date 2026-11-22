import { describe, expect, it } from "vitest";
import { action, loader } from "./unsubscribe";

const request = (token: string, init?: RequestInit) => new Request(`https://example.test/unsubscribe?t=${encodeURIComponent(token)}`, init);

describe("the unsubscribe page's loader and action (a forged link is the only one this template can see: it sends no mail on consent)", () => {
  it("answers a link nobody signed with an invalid page, and changes nothing on a GET", async () => {
    const result = await loader({ request: request("forged.token") });
    expect(result.page).toEqual({ valid: false });
    expect(result.words.invalid).toContain("not valid");
  });

  it("speaks Spanish to a reader whose browser asks for it", async () => {
    const asked = new Request("https://example.test/unsubscribe?t=x", { headers: { "accept-language": "es-ES,es;q=0.9" } });
    expect((await loader({ request: asked })).words.title).toBe("Darse de baja");
  });

  it("refuses a POST with a token that is not ours: 400, and nothing is unsubscribed", async () => {
    const answer = await action({ request: request("forged.token", { method: "POST", body: "List-Unsubscribe=One-Click" }) });
    expect(answer.init?.status).toBe(400);
    expect(answer.data).toEqual({ done: false });
  });

  it("refuses a GET on the action as the kernel does (405), so a scanner never unsubscribes anyone", async () => {
    const answer = await action({ request: request("forged.token")});
    expect(answer.init?.status).toBe(405);
  });
});
