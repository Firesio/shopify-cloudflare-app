import type { PauseReason, PageTally, PageVerdict, RecipientCounts } from "~/domain/campaign-delivery";
import type {
  CampaignAudience,
  CampaignMailer,
  CampaignPumpQueue,
  CampaignStore,
  CampaignTestMailer,
  CampaignUnsubscribes,
} from "~/ports/campaigns";
import type { Runtime } from "~/ports/runtime";

/**
 * Who is asking. A staff member in the console has an account id; an agent holding an MCP token has only the address
 * the token was issued to, so the id is null and the announcement records the address alone.
 */
export interface CampaignActor {
  readonly id: string | null;
  readonly email: string;
}

/** What the log says about the actor: an id or a fixed word, never an address. */
export function actorRef(actor: CampaignActor): string {
  return actor.id ?? "token";
}

export interface CampaignDependencies {
  readonly store: CampaignStore;
  readonly audience: CampaignAudience;
  readonly unsubscribes: CampaignUnsubscribes;
  readonly mailer: CampaignMailer;
  readonly testMailer: CampaignTestMailer;
  readonly queue: CampaignPumpQueue;
  /** The signed link that stops announcements to an address. Built here and passed in: a template never makes links. */
  readonly unsubscribeUrl: (address: string) => Promise<string>;
  readonly runtime: Pick<Runtime, "clock" | "ids">;
  readonly log: (entry: CampaignLogEntry) => void;
}

/** What is worth a line in the log. Never an address, a name or a word of the announcement. */
export type CampaignLogEntry =
  | {
      readonly event: "campaign.created" | "campaign.updated" | "campaign.deleted" | "campaign.test_sent" | "campaign.paused" | "campaign.resumed" | "campaign.cancelled";
      readonly campaign: string;
      readonly by: string;
    }
  | { readonly event: "campaign.started"; readonly campaign: string; readonly by: string; readonly recipients: number }
  | { readonly event: "campaign.page"; readonly campaign: string; readonly tally: PageTally; readonly next: PageVerdict["next"] }
  | { readonly event: "campaign.paused_by_system"; readonly campaign: string; readonly reason: PauseReason }
  | { readonly event: "campaign.finished"; readonly campaign: string; readonly counts: RecipientCounts }
  | { readonly event: "campaign.restarted"; readonly campaign: string }
  | { readonly event: "campaign.enqueue_failed"; readonly campaign: string; readonly reason: string };
