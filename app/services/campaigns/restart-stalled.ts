import { PUMP_STALL_MS } from "~/domain/campaign-delivery";
import { scheduleNextStep } from "./start-campaign";
import type { CampaignDependencies } from "./types";

/** How many stalled campaigns one sweep restarts: a handful is normal, a long list means something else is wrong. */
const RESTART_LIMIT = 20;

/**
 * The watchdog: a `sending` campaign whose delivery chain has been silent for `PUMP_STALL_MS` is assumed lost (a queue
 * message that died, a deploy in the middle of a step) and gets a fresh step. Restarting is always safe: a step only
 * sends to whoever is still pending, and every mail is deduplicated.
 */
export async function restartStalledCampaigns(now: number, deps: Pick<CampaignDependencies, "store" | "queue" | "log">): Promise<{ readonly restarted: number }> {
  const stalled = await deps.store.stalled(now - PUMP_STALL_MS, RESTART_LIMIT);
  for (const id of stalled) {
    deps.log({ event: "campaign.restarted", campaign: id });
    await scheduleNextStep(id, 0, deps);
  }
  return { restarted: stalled.length };
}
