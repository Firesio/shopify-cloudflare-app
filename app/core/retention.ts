/**
 * How long the app keeps what the package would otherwise keep for ever: the app's decision, stated in its privacy policy
 * (`docs/LEGAL_TEMPLATE.md`, "Retention"). `app/firesio.server.ts` passes it as `retention`; the preset's other logs keep its defaults.
 */

/**
 * Days a support conversation NO shop owns (a stranger's mail, the public form) stays after its last message or close, whichever
 * is later; the daily cron then erases it with its messages and files (`retention.unassignedConversationDays`). A year leaves staff
 * time to give it to a shop that installs later. A shop's own conversations go with the shop on `shop/redact`, whatever this says.
 */
export const UNASSIGNED_CONVERSATION_DAYS = 365;
