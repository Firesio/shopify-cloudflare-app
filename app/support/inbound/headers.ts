import { SOURCE_DELIVERY } from "./delivery";
import { normalizeMessageId } from "./thread-match";
import type { SupportSource } from "./types";

// RFC 5322 advises keeping References short; clients truncate long chains anyway.
const MAX_REFERENCES = 20;

/**
 * The threading headers for a reply. Cloudflare Email Service sets `Message-ID`
 * itself and accepts only `In-Reply-To` and `References`, so those two (built
 * from ids we have stored) are all a reply can add.
 */
export function buildThreadHeaders(knownMessageIds: readonly string[]): Record<string, string> {
  const ids = [...new Set(knownMessageIds.map(normalizeMessageId).filter((id) => id !== ""))];
  const last = ids.at(-1);
  if (last === undefined) return {};
  const references = ids.slice(-MAX_REFERENCES).map((id) => `<${id}>`).join(" ");
  return { "In-Reply-To": `<${last}>`, References: references };
}

/**
 * The mail ids the person on the other side has really seen, oldest first.
 *
 * When our first mail starts the thread (`rootOrigin: "outbound"`), the opening
 * message's id belongs to a mail that never reached their mailbox (Shopify's
 * relay), so quoting it in `References` would point at nothing they hold.
 */
export function referenceableMessageIds(
  source: SupportSource,
  messages: readonly { readonly externalId: string | null }[],
): readonly string[] {
  const skipRoot = SOURCE_DELIVERY[source].rootOrigin === "outbound";
  return messages.flatMap((message, index) =>
    message.externalId === null || (skipRoot && index === 0) ? [] : [message.externalId],
  );
}
