import type { BotCheck, BotCheckResult } from "~/ports/bot-check";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;

/**
 * Cloudflare Turnstile. The answer is read from the response body, never from
 * the status: a rejected token is a 200 with `success: false`.
 *
 * Every failure to GET an answer (a timeout, a non-JSON body, a missing secret)
 * is `unavailable`, not `failed`: the visitor did nothing wrong, and counting it
 * as a pass would turn an outage into an open door.
 */
export function turnstileBotCheck(options: { readonly secret: string; readonly fetcher?: typeof fetch }): BotCheck {
  const fetcher = options.fetcher ?? fetch;
  return {
    async verify(token, ip): Promise<BotCheckResult> {
      if (options.secret === "") return "unavailable";
      if (token === null || token.trim() === "") return "failed";
      const body = new URLSearchParams({ secret: options.secret, response: token });
      if (ip !== null) body.set("remoteip", ip);
      try {
        const response = await fetcher(SITEVERIFY, { method: "POST", body, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!response.ok) return "unavailable";
        const answer: unknown = await response.json();
        if (typeof answer !== "object" || answer === null || !("success" in answer)) return "unavailable";
        return answer.success === true ? "passed" : "failed";
      } catch {
        return "unavailable";
      }
    },
  };
}

/** Where no site key is configured (local development): nothing is asked, nothing is claimed. */
export const noBotCheck: BotCheck = { verify: async () => "passed" };
