import type { ParsedMail } from "./types";

const MACHINE_SENDERS = /^(mailer-daemon|postmaster|noreply|no-reply|donotreply|do-not-reply)@/i;

/**
 * Mail no human wrote: bounces, auto-replies, list mail. Answering it can start
 * a loop between two machines, and storing it fills the queue with noise, so it
 * is dropped before anything else.
 *
 * Shopify's relay is the one machine sender that carries a human's message;
 * `receive` classifies that source first, so this runs only on what remains.
 */
export function isAutomatedMail(mail: ParsedMail): boolean {
  const auto = mail.autoSubmitted?.trim().toLowerCase();
  if (auto !== undefined && auto !== "" && auto !== "no") return true;
  const precedence = mail.precedence?.trim().toLowerCase();
  if (precedence === "bulk" || precedence === "junk" || precedence === "list") return true;
  return MACHINE_SENDERS.test(mail.from.address);
}
