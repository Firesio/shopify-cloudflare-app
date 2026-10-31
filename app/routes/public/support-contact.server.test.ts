import { describe, expect, it } from "vitest";
import type { ContactInput } from "~/schemas/support-contact";
import type { ContactClient, ContactFailure } from "~/services/support-contact.server";
import { handleContactAction } from "./support-contact.server";

function request(fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries({ name: "Ada", email: "ada@buyer.example", subject: "Hi", message: "Hello", shop: "", ...fields })) {
    body.set(key, value);
  }
  return new Request("https://example.test/support", { method: "POST", body, headers });
}

function service(outcome: ContactFailure | null = null) {
  const submitted: { input: ContactInput; client: ContactClient }[] = [];
  return {
    submitted,
    service: {
      submit: async (input: ContactInput, client: ContactClient) => {
        submitted.push({ input, client });
        return outcome === null ? ({ ok: true, value: null } as const) : ({ ok: false, reason: outcome } as const);
      },
    },
  };
}

describe("handleContactAction", () => {
  it("hands a valid message to the service with the client's address and token", async () => {
    const { service: dependency, submitted } = service();
    const result = await handleContactAction(
      request({ "cf-turnstile-response": "tok" }, { "CF-Connecting-IP": "203.0.113.5" }),
      { service: dependency },
    );
    expect(result).toEqual({ kind: "sent" });
    expect(submitted).toHaveLength(1);
    expect(submitted[0]?.client).toEqual({ ip: "203.0.113.5", turnstileToken: "tok" });
    expect(submitted[0]?.input.email).toBe("ada@buyer.example");
  });

  it("answers a filled decoy as a success and never reaches the service", async () => {
    const { service: dependency, submitted } = service();
    expect(await handleContactAction(request({ website: "spam" }), { service: dependency })).toEqual({ kind: "sent" });
    expect(submitted).toHaveLength(0);
  });

  it("refuses an invalid message with field reasons and what was typed", async () => {
    const { service: dependency, submitted } = service();
    const result = await handleContactAction(request({ email: "nope", message: "" }), { service: dependency });
    expect(result).toMatchObject({ kind: "refused", status: 400, errors: { email: "email", message: "required" }, failure: null });
    expect(result.kind === "refused" && result.values.email).toBe("nope");
    expect(submitted).toHaveLength(0);
  });

  it("maps each service refusal to its status and keeps the form filled", async () => {
    for (const [reason, status] of [["rate_limited", 429], ["bot_check_failed", 400], ["bot_check_unavailable", 503]] as const) {
      const result = await handleContactAction(request({}), { service: service(reason).service });
      expect(result).toMatchObject({ kind: "refused", status, failure: reason, values: { subject: "Hi" } });
    }
  });
});
