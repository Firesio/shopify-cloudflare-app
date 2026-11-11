import type { ActionOutcome } from "~/lib/action-feedback";
import type { SupportInboxService } from "~/services/support-inbox.server";
import { parseSenderPattern } from "~/support/triage/sender-pattern";
import type { supportTriage } from "~/wiring.server";

export interface SpamIntentContext {
  readonly inbox: Pick<SupportInboxService, "release">;
  readonly triage: ReturnType<typeof supportTriage>;
  /** Who is acting, recorded against a block. */
  readonly actor: string;
  readonly at: number;
}

/** The fields an intent may read, as submitted. Untrusted: each handler narrows what it uses. */
export interface SpamIntentFields {
  /** A held mail's id. */
  readonly id: string;
  /** A sender pattern typed by staff, or one being unblocked. */
  readonly pattern: string;
}

type Handler = (fields: SpamIntentFields, context: SpamIntentContext) => Promise<ActionOutcome>;

export const SPAM_INTENTS = ["release", "discard", "block_sender", "block_pattern", "unblock"] as const;
export type SpamIntent = (typeof SPAM_INTENTS)[number];

/** The submitted intent, narrowed by membership: it comes off a form, so it is attacker-controlled. */
export function readSpamIntent(value: string): SpamIntent | null {
  return SPAM_INTENTS.find((intent) => intent === value) ?? null;
}

const GONE: ActionOutcome = { error: "That mail is already gone." };
const BAD_PATTERN: ActionOutcome = { error: "Enter an email address or a domain, like spam.example." };

/**
 * Command dispatch on the submitted intent (@rules/core.md): the action only looks a handler up. Keyed by the intent
 * union, so a new intent cannot ship without one.
 */
export const SPAM_INTENT_HANDLERS: Record<SpamIntent, Handler> = {
  release: async ({ id }, { inbox }) => {
    const released = await inbox.release(id);
    return released.ok ? { success: "Released. It is now an open ticket." } : GONE;
  },
  discard: async ({ id }, { triage }) => ((await triage.discard(id)) ? { success: "Deleted." } : GONE),
  // The mailbox of a held mail, and every other mail already held from it.
  block_sender: async ({ id }, { triage, actor, at }) => {
    const held = await triage.find(id);
    if (held === null) return GONE;
    const pattern = parseSenderPattern(held.senderEmail);
    if (!pattern.ok) return BAD_PATTERN;

    await triage.block({ pattern: pattern.value, createdBy: actor, at });
    await triage.discardFromSender(held.senderEmail);
    return { success: `Blocked ${pattern.value}.` };
  },
  block_pattern: async ({ pattern: typed }, { triage, actor, at }) => {
    const pattern = parseSenderPattern(typed);
    if (!pattern.ok) return BAD_PATTERN;

    await triage.block({ pattern: pattern.value, createdBy: actor, at });
    return { success: `Blocked ${pattern.value}.` };
  },
  unblock: async ({ pattern }, { triage }) => {
    await triage.unblock(pattern);
    return { success: "Unblocked." };
  },
};
