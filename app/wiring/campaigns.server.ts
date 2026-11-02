import { CloudflareCampaignQueue } from "~/adapters/campaign-queue.server";
import { createCampaignMailer } from "~/adapters/campaign-mailer.server";
import { signUnsubscribeToken } from "~/lib/unsubscribe-token";
import { previewAudience } from "~/models/campaign-audience.server";
import { CampaignRepo } from "~/models/campaigns.server";
import { CampaignUnsubscribeRepo } from "~/models/campaign-unsubscribes.server";
import { notify } from "~/notifications/notify.server";
import type { CampaignTestMailer, CampaignUnsubscribes } from "~/ports/campaigns";
import { getEnv } from "~/request-context.server";
import type { CampaignConsumerDependencies } from "~/services/campaign-queue";
import { pumpCampaign } from "~/services/campaigns/pump-campaign";
import { restartStalledCampaigns } from "~/services/campaigns/restart-stalled";
import type { CampaignDependencies } from "~/services/campaigns/types";
import { absolute, paths } from "~/urls";
import { requireAttachmentTokenSecret } from "~/wiring/ai-support.server";
import { immediateNotifier, notificationDependencies } from "~/wiring/notifications.server";
import { appRuntime } from "~/wiring/runtime.server";

/** The addresses that asked to stop receiving announcements. The public unsubscribe page is the other writer. */
export function campaignUnsubscribes(): CampaignUnsubscribes {
  return new CampaignUnsubscribeRepo();
}

/** The proof mail goes through the same `notify()` as the real one, in the caller's request so they learn if it arrived. */
function campaignTestMailer(): CampaignTestMailer {
  return {
    async send({ email, payload }) {
      const { delivered } = await immediateNotifier().sendNow({ event: "campaign_message", to: { email }, payload, scope: "campaign-test" });
      return { delivered: delivered > 0 };
    },
  };
}

/**
 * Everything an announcement's use cases need. Delivery sends INSIDE the queue step through `notify()` (not the queued
 * notifier): the step is itself the queued work, and it must learn each mail's outcome to pace and to stop.
 */
export function campaignDependencies(): CampaignDependencies {
  const env = getEnv();
  return {
    store: new CampaignRepo(),
    audience: { preview: previewAudience },
    unsubscribes: campaignUnsubscribes(),
    mailer: createCampaignMailer({ notify: (request) => notify(request, notificationDependencies()) }),
    testMailer: campaignTestMailer(),
    queue: new CloudflareCampaignQueue(env.CAMPAIGN_QUEUE),
    unsubscribeUrl: async (address) =>
      absolute(env.SHOPIFY_APP_URL, paths.unsubscribe(await signUnsubscribeToken({ secret: requireAttachmentTokenSecret(env), address }))),
    runtime: appRuntime(),
    log: (entry) => console.log(JSON.stringify(entry)),
  };
}

/** What the campaign queue runs per message: one delivery step. */
export function campaignConsumerDependencies(): CampaignConsumerDependencies {
  return {
    pump: (campaignId) => pumpCampaign(campaignId, campaignDependencies()),
    log: (entry) => console[entry.event === "campaign.queue_retry" ? "warn" : "log"](JSON.stringify(entry)),
  };
}

/** The cron sweep that restarts a delivery chain that went quiet. */
export function campaignWatchdog(): { run(now: number): Promise<Readonly<Record<string, number>>> } {
  return { run: (now) => restartStalledCampaigns(now, campaignDependencies()) };
}
