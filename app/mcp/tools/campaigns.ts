import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CAMPAIGN_STATUSES, CONTENT_LIMITS } from "~/domain/campaign";
import {
  cancelCampaign,
  createDraft,
  deleteDraft,
  pauseCampaign,
  resumeCampaign,
  sendTestCampaign,
  startCampaign,
  updateDraft,
  type CampaignActor,
  type ControlOutcome,
} from "~/services/campaigns.server";
import {
  findCampaign,
  getCampaignDetail,
  listCampaignSummaries,
  previewAudienceFor,
  resolveCampaignActor,
  RECIPIENT_SAMPLE_MAX,
} from "~/services/internal-admin/campaign-mcp-ops.server";
import { campaignDependencies } from "~/wiring.server";
import { mcpMutation, mcpRead, MUTATION, READ_ONLY, type McpActorContext } from "../helpers";
import {
  AUDIENCE_INPUT,
  audienceFilterFrom,
  audienceView,
  campaignView,
  contentFaults,
  NOT_DRAFT,
  NOT_FOUND,
  previewView,
} from "./campaign-results";

/** An agent has no admin account id: the announcement records the address of the staff member its token was issued to. */
async function actorOf(ctx: McpActorContext): Promise<CampaignActor> {
  return (await resolveCampaignActor({ adminUserId: ctx.adminUserId, fallbackLabel: ctx.actorEmail })).actor;
}

const ID = z.string().min(1).describe("The campaign id, from create_campaign or list_campaigns");

const CONTENT_FIELDS = {
  name: z.string().max(CONTENT_LIMITS.name).describe("The team's own label for it; merchants never see it"),
  subject: z.string().max(CONTENT_LIMITS.subject).describe("The email subject merchants see"),
  body: z
    .string()
    .max(CONTENT_LIMITS.body)
    .describe("Plain text, no markup: what is written is what is sent. A blank line starts a new paragraph"),
  ctaLabel: z.string().max(CONTENT_LIMITS.ctaLabel).optional().describe("Button text. Give ctaLabel and ctaUrl together, or neither"),
  ctaUrl: z.string().max(CONTENT_LIMITS.ctaUrl).optional().describe("Button link, https only. Give ctaLabel and ctaUrl together, or neither"),
};

function registerListCampaigns(server: McpServer, ctx: McpActorContext) {
  server.registerTool(
    "list_campaigns",
    {
      title: "List Campaigns",
      description:
        "Lists announcements (campaigns) the team emails to many merchants at once, newest first, without their bodies. Statuses: draft, sending, paused, sent, cancelled.",
      inputSchema: {
        status: z.enum(CAMPAIGN_STATUSES).optional().describe("Only campaigns in this status"),
        limit: z.number().int().min(1).max(100).optional().describe("Maximum campaigns to return (default: 25)"),
      },
      annotations: READ_ONLY,
    },
    mcpRead("list_campaigns", "mcp:read", ctx, async (args) => {
      const campaigns = await listCampaignSummaries({ status: args.status, limit: args.limit ?? 25 });
      return { campaigns, next: "Use get_campaign with an id for the full words, audience and delivery counts." };
    }),
  );
}

function registerGetCampaign(server: McpServer, ctx: McpActorContext) {
  server.registerTool(
    "get_campaign",
    {
      title: "Get Campaign",
      description: `Everything about one campaign: the full words, who it goes to (in sentences and as a filter), status, why it paused, delivery counts, percent done, timestamps, and a bounded sample of recipients (at most ${RECIPIENT_SAMPLE_MAX}; merchant addresses are included).`,
      inputSchema: {
        id: ID,
        recipientStatus: z.enum(["pending", "sent", "failed", "refused", "skipped"]).optional().describe("Sample only recipients in this status"),
        recipientLimit: z.number().int().min(1).max(RECIPIENT_SAMPLE_MAX).optional().describe("Recipients in the sample (default 10 per status)"),
      },
      annotations: READ_ONLY,
    },
    mcpRead("get_campaign", "mcp:read", ctx, async (args) => {
      const detail = await getCampaignDetail({ id: args.id, recipientStatus: args.recipientStatus, recipientLimit: args.recipientLimit ?? 10 });
      if (detail === undefined) return NOT_FOUND(args.id);
      const { campaign } = detail;
      return {
        ok: true,
        campaign: {
          ...campaignView(campaign),
          status: campaign.status,
          pauseReason: campaign.pauseReason,
          recipientCount: campaign.recipientCount,
          createdByEmail: campaign.createdByEmail,
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
          startedAt: campaign.startedAt,
          completedAt: campaign.completedAt,
        },
        audience: audienceView(campaign.audience),
        counts: detail.counts,
        percentDone: detail.percentDone,
        recipients: detail.recipients,
      };
    }),
  );
}

function registerPreviewAudience(server: McpServer, ctx: McpActorContext) {
  server.registerTool(
    "preview_campaign_audience",
    {
      title: "Preview Campaign Audience",
      description:
        "Sizes an audience before any draft exists: how many shops match, how many have no address, how many unsubscribed, how many would actually receive it, and a few of them. Sends nothing.",
      inputSchema: { audience: AUDIENCE_INPUT.optional() },
      annotations: READ_ONLY,
    },
    mcpRead("preview_campaign_audience", "mcp:read", ctx, async (args) => {
      const audience = audienceFilterFrom(args.audience);
      if (!audience.ok) return audience;
      return { ok: true, audience: audienceView(audience.filter), preview: previewView(await previewAudienceFor(audience.filter)) };
    }),
  );
}

function registerCreateCampaign(server: McpServer, ctx: McpActorContext) {
  server.registerTool(
    "create_campaign",
    {
      title: "Create Campaign Draft",
      description:
        "Writes a DRAFT announcement. Nothing is sent and no merchant is contacted. Returns the draft with the real number of merchants it would reach, so you can show the human the recipient count and subject before anything else happens.",
      inputSchema: { ...CONTENT_FIELDS, audience: AUDIENCE_INPUT.optional() },
      annotations: MUTATION,
    },
    mcpMutation("create_campaign", "mcp:campaigns:write", ctx, async (args) => {
      const audience = audienceFilterFrom(args.audience);
      if (!audience.ok) return audience;
      const outcome = await createDraft(
        await actorOf(ctx),
        { name: args.name, subject: args.subject, body: args.body, ctaLabel: args.ctaLabel ?? "", ctaUrl: args.ctaUrl ?? "", audience: audience.filter },
        campaignDependencies(),
      );
      if (!outcome.ok) return outcome.reason === "invalid" ? contentFaults(outcome.errors) : NOT_FOUND("new");
      const preview = await previewAudienceFor(audience.filter);
      return {
        ok: true,
        status: "draft",
        campaign: campaignView(outcome.campaign),
        audience: audienceView(outcome.campaign.audience),
        preview: previewView(preview),
        next: "Show the human the recipients count and the subject. Offer send_campaign_test to proof it in their own inbox. Only call start_campaign after they explicitly approve sending, passing that recipients number as expectedRecipients.",
      };
    }),
  );
}

function registerUpdateCampaign(server: McpServer, ctx: McpActorContext) {
  server.registerTool(
    "update_campaign",
    {
      title: "Update Campaign Draft",
      description:
        "Changes a DRAFT: any of name, subject, body, button and audience; what you leave out stays as it is. A campaign that has started cannot be edited. Sends nothing.",
      inputSchema: {
        id: ID,
        name: CONTENT_FIELDS.name.optional(),
        subject: CONTENT_FIELDS.subject.optional(),
        body: CONTENT_FIELDS.body.optional(),
        ctaLabel: CONTENT_FIELDS.ctaLabel.describe("Button text; an empty string removes the button (also clear ctaUrl)"),
        ctaUrl: CONTENT_FIELDS.ctaUrl.describe("Button link, https only; an empty string removes the button (also clear ctaLabel)"),
        audience: AUDIENCE_INPUT.optional(),
      },
      annotations: MUTATION,
    },
    mcpMutation("update_campaign", "mcp:campaigns:write", ctx, async (args) => {
      const current = await findCampaign(args.id);
      if (current === undefined) return NOT_FOUND(args.id);
      const audience = args.audience === undefined ? { ok: true as const, filter: current.audience } : audienceFilterFrom(args.audience);
      if (!audience.ok) return audience;
      const outcome = await updateDraft(
        await actorOf(ctx),
        args.id,
        {
          name: args.name ?? current.name,
          subject: args.subject ?? current.subject,
          body: args.body ?? current.body,
          ctaLabel: args.ctaLabel ?? current.ctaLabel ?? "",
          ctaUrl: args.ctaUrl ?? current.ctaUrl ?? "",
          audience: audience.filter,
        },
        campaignDependencies(),
      );
      if (!outcome.ok) {
        if (outcome.reason === "invalid") return contentFaults(outcome.errors);
        return outcome.reason === "not_found" ? NOT_FOUND(args.id) : NOT_DRAFT(args.id);
      }
      return {
        ok: true,
        status: "draft",
        campaign: campaignView(outcome.campaign),
        audience: audienceView(outcome.campaign.audience),
        preview: previewView(await previewAudienceFor(outcome.campaign.audience)),
        next: "Show the human what changed and the recipients count. The count may differ from before: use this one for expectedRecipients.",
      };
    }),
  );
}

function registerDeleteCampaign(server: McpServer, ctx: McpActorContext) {
  server.registerTool(
    "delete_campaign",
    {
      title: "Delete Campaign Draft",
      description: "Deletes a DRAFT that was never sent. A campaign that has started is cancelled instead (cancel_campaign) and kept as the record.",
      inputSchema: { id: ID },
      annotations: MUTATION,
    },
    mcpMutation("delete_campaign", "mcp:campaigns:write", ctx, async (args) => {
      const outcome = await deleteDraft(await actorOf(ctx), args.id, campaignDependencies());
      if (outcome.ok) return { ok: true, deleted: args.id };
      return outcome.reason === "not_found" ? NOT_FOUND(args.id) : NOT_DRAFT(args.id);
    }),
  );
}

function registerSendTest(server: McpServer, ctx: McpActorContext) {
  server.registerTool(
    "send_campaign_test",
    {
      title: "Send Campaign Test To Me",
      description:
        "Emails the announcement, marked [Test], to the token owner's own address and to nobody else, so a human can read it as a merchant would. Works on any campaign. Says whether it was delivered.",
      inputSchema: { id: ID },
      annotations: MUTATION,
    },
    mcpMutation("send_campaign_test", "mcp:campaigns:write", ctx, async (args) => {
      const { actor, address } = await resolveCampaignActor({ adminUserId: ctx.adminUserId, fallbackLabel: ctx.actorEmail });
      if (address === null) {
        return {
          ok: false,
          reason: "no_owner_address",
          message: "This token is not tied to a staff account with an email address, so there is nowhere safe to send a test.",
          next: "Nothing was sent. Ask the human to proof the announcement in the console instead.",
        };
      }
      const outcome = await sendTestCampaign(actor, args.id, campaignDependencies());
      if (!outcome.ok) return NOT_FOUND(args.id);
      return {
        ok: true,
        delivered: outcome.delivered,
        sentTo: address,
        next: outcome.delivered
          ? "Ask the human to check their inbox, then to approve or request changes."
          : "The test was not delivered (the mail channel refused or is not set up). Tell the human; do not treat the announcement as proofed.",
      };
    }),
  );
}

function controlResult(id: string, outcome: ControlOutcome, next: string) {
  if (outcome.ok) return { ok: true, status: outcome.status, next };
  if (outcome.reason === "not_found") return NOT_FOUND(id);
  return { ok: false, reason: "illegal", message: `Campaign '${id}' is not in a state that allows this.`, next: "Use get_campaign to see its status." };
}

function registerControlTools(server: McpServer, ctx: McpActorContext) {
  const controls = [
    {
      name: "pause_campaign",
      title: "Pause Campaign",
      description: "Stops a SENDING campaign after the step in flight. Whoever is still waiting keeps their place for resume_campaign.",
      run: pauseCampaign,
      next: "Sending stops after the step in flight; some more mail may still go out. Use resume_campaign to carry on or cancel_campaign to end it.",
    },
    {
      name: "resume_campaign",
      title: "Resume Campaign",
      description: "Carries on a PAUSED campaign (including one the system paused for a bounce rate or a missing mail channel) from whoever is still waiting. This sends mail to merchants again.",
      run: resumeCampaign,
      next: "Sending carries on in the background. Use get_campaign to follow progress.",
    },
    {
      name: "cancel_campaign",
      title: "Cancel Campaign",
      description:
        "Ends a campaign for good. Merchants not yet written to are marked skipped; mail already sent cannot be recalled. A step in flight may finish its current page. Cancelled cannot be revived: copy it into a new draft instead.",
      run: cancelCampaign,
      next: "Cancelled. Mail already sent cannot be recalled; whoever was still waiting was skipped. Use get_campaign for the counts.",
    },
  ] as const;
  for (const control of controls) {
    server.registerTool(
      control.name,
      { title: control.title, description: control.description, inputSchema: { id: ID }, annotations: MUTATION },
      mcpMutation(control.name, "mcp:campaigns:write", ctx, async (args) =>
        controlResult(args.id, await control.run(await actorOf(ctx), args.id, campaignDependencies()), control.next),
      ),
    );
  }
}

function registerStartCampaign(server: McpServer, ctx: McpActorContext) {
  server.registerTool(
    "start_campaign",
    {
      title: "Start Campaign: Email Real Merchants",
      description:
        "STARTS SENDING: emails the real merchants in the audience, for real, and it CANNOT BE UNDONE (cancel only stops those not yet written to). Do NOT call this unless the human has explicitly asked to send this campaign, after seeing its subject and recipient count. `expectedRecipients` must be the recipients number from the latest create_campaign, update_campaign, preview or get_campaign that the human approved; if the audience is a different size now, nothing is sent and the new count is returned.",
      inputSchema: {
        id: ID,
        expectedRecipients: z.number().int().min(1).describe("The recipients count the human approved. A different current count refuses the send"),
      },
      annotations: { ...MUTATION, destructiveHint: true },
    },
    mcpMutation("start_campaign", "mcp:campaigns:send", ctx, async (args) => {
      const outcome = await startCampaign(await actorOf(ctx), { id: args.id, expectedRecipients: args.expectedRecipients }, campaignDependencies());
      if (outcome.ok) {
        return { ok: true, status: "sending", recipients: outcome.recipients, next: "Delivery runs in the background. Use get_campaign to follow progress; pause_campaign stops it." };
      }
      if (outcome.reason === "audience_changed") {
        return {
          ok: false,
          reason: "audience_changed",
          expectedRecipients: args.expectedRecipients,
          recipients: outcome.recipients,
          next: "Nothing was sent. Tell the human the audience is now this size, and call start_campaign again only if they approve the new number.",
        };
      }
      const messages = {
        not_found: NOT_FOUND(args.id).message,
        not_draft: NOT_DRAFT(args.id).message,
        no_recipients: "Nobody would receive it: the audience is empty. Nothing was sent.",
        changed: "The draft was edited or started while this ran. Nothing was sent; read it again with get_campaign.",
      } as const;
      return { ok: false, reason: outcome.reason, message: messages[outcome.reason], next: "Nothing was sent." };
    }),
  );
}

export function registerCampaignTools(server: McpServer, ctx: McpActorContext) {
  registerListCampaigns(server, ctx);
  registerGetCampaign(server, ctx);
  registerPreviewAudience(server, ctx);
  registerCreateCampaign(server, ctx);
  registerUpdateCampaign(server, ctx);
  registerDeleteCampaign(server, ctx);
  registerSendTest(server, ctx);
  registerControlTools(server, ctx);
  registerStartCampaign(server, ctx);
}
