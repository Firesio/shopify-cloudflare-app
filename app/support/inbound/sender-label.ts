import type { MailAddress } from "./types";

const LABEL_MAX = 160;

/** Control characters, bidi marks, angle brackets and quotes: a display name cannot fake the `<address>` part. */
function isUnsafeInName(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  const isControl = code <= 0x1f || code === 0x7f;
  const isBidi = code === 0x200e || code === 0x200f || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069);
  return isControl || isBidi || character === "<" || character === ">" || character === '"';
}

/**
 * Who wrote a mail, as the console shows it: the display name AND the address (`Customer Service <cs@example.org>`),
 * or the address alone when the name is empty or just repeats it.
 *
 * The address is always there on purpose. A message can be added to a thread by someone who is not its asker (whoever
 * answers the `support+<id>@` mail), and staff must be able to tell that from the merchant's own mailbox.
 */
export function senderLabel(from: MailAddress): string {
  const address = from.address.trim();
  const name = [...from.name].filter((character) => !isUnsafeInName(character)).join("").replace(/\s+/g, " ").trim();
  const label = name === "" || name.toLowerCase() === address.toLowerCase() ? address : `${name} <${address}>`;
  return label.length <= LABEL_MAX ? label : `${label.slice(0, LABEL_MAX - 1)}…`;
}
