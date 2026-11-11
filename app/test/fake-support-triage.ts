import type { HeldMail, InboundTriage, NewHeldMail, SpamQuarantine } from "~/ports/support-triage";
import { OPEN_CONVERSATION } from "~/support/triage/decision";
import type { TriageDecision } from "~/support/triage/types";

/**
 * In-memory `SpamQuarantine`. Same contract as the D1 one: a mail held twice (by its own id) is held once, and
 * finding or discarding what is gone says so. The real repo is covered against D1 separately.
 */
export class FakeSpamQuarantine implements SpamQuarantine {
  readonly held: HeldMail[] = [];
  private next = 1;

  async hold(mail: NewHeldMail): Promise<boolean> {
    if (this.held.some((entry) => entry.externalId === mail.externalId)) return false;
    this.held.push({ ...mail, id: `held-${this.next++}` });
    return true;
  }

  async find(id: string): Promise<HeldMail | null> {
    return this.held.find((entry) => entry.id === id) ?? null;
  }

  async discard(id: string): Promise<boolean> {
    const index = this.held.findIndex((entry) => entry.id === id);
    if (index === -1) return false;
    this.held.splice(index, 1);
    return true;
  }
}

/** A triage that always decides the same thing: by default, open every conversation as before. */
export function fixedTriage(decision: TriageDecision = OPEN_CONVERSATION): InboundTriage {
  return { assess: async () => decision };
}
