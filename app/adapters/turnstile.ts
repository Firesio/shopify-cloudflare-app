import type { BotCheck } from "@firesio/support";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 4_000;

/** Cloudflare Turnstile on the public support form. No secret configured = the check is off (local development only). */
export function turnstile(secret: string, fetcher: typeof fetch): BotCheck {
  return {
    async verify(token, ip) {
      if (secret === "") return "passed";
      if (token === null || token === "") return "failed";
      const form = new FormData();
      form.set("secret", secret);
      form.set("response", token);
      if (ip !== null) form.set("remoteip", ip);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetcher(VERIFY_URL, { method: "POST", body: form, signal: controller.signal });
        if (!response.ok) return "unavailable";
        const body: unknown = await response.json();
        return typeof body === "object" && body !== null && "success" in body && body.success === true ? "passed" : "failed";
      } catch {
        return "unavailable";
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
