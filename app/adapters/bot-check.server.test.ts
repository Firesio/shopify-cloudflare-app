import { describe, expect, it } from "vitest";
import { noBotCheck, turnstileBotCheck } from "./bot-check.server";

function fetcher(answer: () => Response | Promise<Response>, seen: { body?: URLSearchParams } = {}): typeof fetch {
  return async (_input, init) => {
    if (init?.body instanceof URLSearchParams) seen.body = init.body;
    return answer();
  };
}

describe("turnstileBotCheck", () => {
  it("passes a token Cloudflare accepts and sends the secret, token and ip", async () => {
    const seen: { body?: URLSearchParams } = {};
    const check = turnstileBotCheck({ secret: "s", fetcher: fetcher(() => Response.json({ success: true }), seen) });
    expect(await check.verify("tok", "203.0.113.5")).toBe("passed");
    expect(Object.fromEntries(seen.body ?? [])).toEqual({ secret: "s", response: "tok", remoteip: "203.0.113.5" });
  });

  it("fails a rejected token, and a missing one without asking", async () => {
    let asked = 0;
    const check = turnstileBotCheck({ secret: "s", fetcher: fetcher(() => { asked += 1; return Response.json({ success: false }); }) });
    expect(await check.verify("bad", null)).toBe("failed");
    expect(await check.verify(null, null)).toBe("failed");
    expect(await check.verify("  ", null)).toBe("failed");
    expect(asked).toBe(1);
  });

  it("calls an outage unavailable, never a pass", async () => {
    expect(await turnstileBotCheck({ secret: "s", fetcher: fetcher(() => new Response("no", { status: 502 })) }).verify("t", null)).toBe("unavailable");
    expect(await turnstileBotCheck({ secret: "s", fetcher: fetcher(() => new Response("<html>")) }).verify("t", null)).toBe("unavailable");
    expect(await turnstileBotCheck({ secret: "s", fetcher: fetcher(() => Response.json({ ok: true })) }).verify("t", null)).toBe("unavailable");
    expect(await turnstileBotCheck({ secret: "s", fetcher: fetcher(() => { throw new Error("offline"); }) }).verify("t", null)).toBe("unavailable");
  });

  it("is unavailable without a secret, so a missing secret cannot open the form", async () => {
    expect(await turnstileBotCheck({ secret: "", fetcher: fetcher(() => Response.json({ success: true })) }).verify("t", null)).toBe("unavailable");
    expect(await noBotCheck.verify(null, null)).toBe("passed");
  });
});
