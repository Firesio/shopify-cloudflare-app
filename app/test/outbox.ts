import { env } from "cloudflare:test";

export interface OutboxEvent {
  readonly type: string;
  readonly eventId: string;
  readonly accountId: string | null;
}

/** The events waiting in the portal outbox, oldest first: what a test asserts a change emitted. */
export async function outboxEvents(): Promise<OutboxEvent[]> {
  const rows = await env.DB.prepare(`SELECT type, event_id, account_id FROM portal_outbox ORDER BY created_at, event_id`).all();
  return rows.results.flatMap((row) => {
    const { type, event_id: eventId, account_id: accountId } = row;
    return typeof type === "string" && typeof eventId === "string" ? [{ type, eventId, accountId: typeof accountId === "string" ? accountId : null }] : [];
  });
}
