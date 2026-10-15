import type { StaffTopic } from "~/domain/staff-notification-topics";

/**
 * Which staff topic a support notification belongs to.
 *
 * One event (`support_merchant_activity`) serves two topics, and a person chooses by topic: a new ticket and a reply
 * are separate switches in their settings. The source and the push both decide it here, so they cannot disagree.
 */
export function staffTopicForSupportActivity(isNew: boolean): StaffTopic {
  return isNew ? "support_ticket_opened" : "support_ticket_reply";
}
