import { describe, expect, it } from "vitest";
import type { BotCheckResult } from "~/ports/bot-check";
import type { ContactInput } from "~/schemas/support-contact";
import { SupportContactService } from "./support-contact.server";

const INPUT: ContactInput = { name: "Ada", email: "ada@buyer.example", subject: "Hi", message: "Hello", shop: null };

function setup(over: { allowed?: boolean; verdict?: BotCheckResult } = {}) {
  const calls: string[] = [];
  const service = new SupportContactService({
    withinRateLimit: async (key) => { calls.push(`limit:${key}`); return over.allowed ?? true; },
    botCheck: { verify: async (token, ip) => { calls.push(`bot:${token}:${ip}`); return over.verdict ?? "passed"; } },
    inbox: { submitForm: async () => { calls.push("submit"); return { ticketId: "t1" }; } },
  });
  return { calls, service };
}

describe("SupportContactService", () => {
  it("stores the message once the client is allowed and proven human", async () => {
    const { calls, service } = setup();
    expect(await service.submit(INPUT, { ip: "203.0.113.5", turnstileToken: "tok" })).toEqual({ ok: true, value: null });
    expect(calls).toEqual(["limit:203.0.113.5", "bot:tok:203.0.113.5", "submit"]);
  });

  it("stops a flood before paying for the bot check, and writes nothing", async () => {
    const { calls, service } = setup({ allowed: false });
    expect(await service.submit(INPUT, { ip: "203.0.113.5", turnstileToken: "tok" })).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(calls).toEqual(["limit:203.0.113.5"]);
  });

  it("writes nothing when the check fails or cannot be made", async () => {
    const failed = setup({ verdict: "failed" });
    expect(await failed.service.submit(INPUT, { ip: null, turnstileToken: null })).toMatchObject({ reason: "bot_check_failed" });
    expect(failed.calls).not.toContain("submit");
    const unavailable = setup({ verdict: "unavailable" });
    expect(await unavailable.service.submit(INPUT, { ip: null, turnstileToken: null })).toMatchObject({ reason: "bot_check_unavailable" });
    expect(unavailable.calls).not.toContain("submit");
    expect(unavailable.calls[0]).toBe("limit:unknown");
  });
});
