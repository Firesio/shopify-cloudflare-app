import { err, ok, type Result } from "~/lib/result";
import type { BotCheck } from "~/ports/bot-check";
import type { ContactInput } from "~/schemas/support-contact";
import type { SupportInboxService } from "~/services/support-inbox.server";

export type ContactFailure = "rate_limited" | "bot_check_failed" | "bot_check_unavailable";

export interface SupportContactDependencies {
  /** True while the client is within its allowance. Absent limiter: always true (fails open). */
  readonly withinRateLimit: (clientKey: string) => Promise<boolean>;
  readonly botCheck: BotCheck;
  readonly inbox: Pick<SupportInboxService, "submitForm">;
}

export interface ContactClient {
  readonly ip: string | null;
  readonly turnstileToken: string | null;
}

/**
 * The public support form. Cheapest refusal first: a flood is stopped by the
 * limiter before any outbound check is paid for, and the bot check runs before
 * anything is written.
 */
export class SupportContactService {
  constructor(private readonly dependencies: SupportContactDependencies) {}

  async submit(input: ContactInput, client: ContactClient): Promise<Result<null, ContactFailure>> {
    if (!(await this.dependencies.withinRateLimit(client.ip ?? "unknown"))) return err("rate_limited");

    const verdict = await this.dependencies.botCheck.verify(client.turnstileToken, client.ip);
    if (verdict === "failed") return err("bot_check_failed");
    if (verdict === "unavailable") return err("bot_check_unavailable");

    await this.dependencies.inbox.submitForm(input);
    return ok(null);
  }
}
