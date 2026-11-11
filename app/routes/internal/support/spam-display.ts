import type { SpamReason } from "~/support/triage/types";

/** Staff-facing names for why a mail was held (English-only console). */
export const REASON_LABEL: Record<SpamReason, string> = {
  blocked_sender: "Blocked sender",
  flood: "Too many mails",
  ai_spam: "Looks like spam",
};
