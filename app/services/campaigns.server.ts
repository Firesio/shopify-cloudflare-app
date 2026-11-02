/**
 * The facade for announcements ("campaigns"): entry points import from here, and the use cases stay private to
 * `services/campaigns/`.
 */
export { createDraft, deleteDraft, updateDraft, type DeleteOutcome, type DraftInput, type DraftOutcome } from "./campaigns/draft-campaign";
export { startCampaign, type StartOutcome } from "./campaigns/start-campaign";
export { cancelCampaign, pauseCampaign, resumeCampaign, type ControlOutcome } from "./campaigns/control-campaign";
export { pumpCampaign, type PumpResult } from "./campaigns/pump-campaign";
export { restartStalledCampaigns } from "./campaigns/restart-stalled";
export { sendTestCampaign, type TestOutcome } from "./campaigns/send-test";
export { actorRef, type CampaignActor, type CampaignDependencies, type CampaignLogEntry } from "./campaigns/types";
