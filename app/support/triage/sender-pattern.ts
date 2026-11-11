import { err, ok, type Result } from "~/lib/result";

const SENDER_PATTERN_MAX = 254;
const ADDRESS = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * What staff typed, as the one form we store: a full address (`a@b.com`) blocks that mailbox, a bare
 * domain (`b.com`, with or without a leading `@`) blocks the domain and every subdomain of it.
 *
 * A single label such as `com` is refused: it would block a whole TLD, which is never what was meant.
 */
export function parseSenderPattern(input: string): Result<string, "invalid"> {
  const pattern = input.trim().toLowerCase().replace(/^@/, "");
  if (pattern.length > SENDER_PATTERN_MAX) return err("invalid");
  return ADDRESS.test(pattern) || DOMAIN.test(pattern) ? ok(pattern) : err("invalid");
}

function matches(pattern: string, address: string): boolean {
  if (pattern.includes("@")) return pattern === address;
  const domain = address.slice(address.lastIndexOf("@") + 1);
  return domain === pattern || domain.endsWith(`.${pattern}`);
}

/** Whether `address` is covered by any stored pattern. PURE: the caller reads the patterns. */
export function isBlockedSender(patterns: readonly string[], address: string): boolean {
  const sender = address.trim().toLowerCase();
  return patterns.some((pattern) => matches(pattern, sender));
}
