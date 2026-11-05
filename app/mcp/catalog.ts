export const MCP_SERVER_NAME = "shopify-app-admin";
export const MCP_SERVER_VERSION = "1.0.0";

export interface ToolCatalogEntry {
  readonly name: string;
  readonly domain: string;
  readonly scope: string;
  readonly isMutation: boolean;
  readonly summary: string;
}

export const TOOL_CATALOG: {
  readonly domain: string;
  readonly tools: readonly ToolCatalogEntry[];
}[] = [
  {
    domain: "Revenue & Platform Metrics",
    tools: [
      {
        name: "get_revenue_and_plans",
        domain: "Revenue & Platform Metrics",
        scope: "mcp:read",
        isMutation: false,
        summary: "Real MRR by currency and store count per plan (excluding dev stores).",
      },
      {
        name: "get_churn_and_retention",
        domain: "Revenue & Platform Metrics",
        scope: "mcp:read",
        isMutation: false,
        summary: "Churn rate, uninstalls, net growth, and scheduled cancellations.",
      },
      {
        name: "get_system_health",
        domain: "Revenue & Platform Metrics",
        scope: "mcp:read",
        isMutation: false,
        summary: "Overall system vitals, webhook failures, and open ticket counts.",
      },
      {
        name: "get_ai_spend_and_usage",
        domain: "Revenue & Platform Metrics",
        scope: "mcp:read",
        isMutation: false,
        summary: "Internal Workers AI tokens, drafting calls, latency, and costs.",
      },
    ],
  },
  {
    domain: "Store Onboarding & Operations",
    tools: [
      {
        name: "list_new_stores",
        domain: "Store Onboarding & Operations",
        scope: "mcp:shops:read",
        isMutation: false,
        summary: "Stores newly installed in the last N hours.",
      },
      {
        name: "list_shops",
        domain: "Store Onboarding & Operations",
        scope: "mcp:shops:read",
        isMutation: false,
        summary: "Directory of stores with install status, plan, and dev flag.",
      },
      {
        name: "get_shop_dossier",
        domain: "Store Onboarding & Operations",
        scope: "mcp:shops:read",
        isMutation: false,
        summary: "360-degree merchant dossier: plan, installation, tickets, and quotas.",
      },
      {
        name: "get_shop_webhook_status",
        domain: "Store Onboarding & Operations",
        scope: "mcp:shops:read",
        isMutation: false,
        summary: "Check a shop's webhook connectivity and granted OAuth scopes.",
      },
      {
        name: "list_webhook_failures",
        domain: "Store Onboarding & Operations",
        scope: "mcp:read",
        isMutation: false,
        summary: "Inspect failed or dead-lettered Shopify webhooks.",
      },
    ],
  },
  {
    domain: "Support Ticket Operations",
    tools: [
      {
        name: "list_tickets",
        domain: "Support Ticket Operations",
        scope: "mcp:read",
        isMutation: false,
        summary: "List support tickets filtered by status, unread, or category.",
      },
      {
        name: "get_ticket_thread",
        domain: "Support Ticket Operations",
        scope: "mcp:read",
        isMutation: false,
        summary: "Fetch full conversation thread with messages and attachments.",
      },
      {
        name: "reply_to_ticket",
        domain: "Support Ticket Operations",
        scope: "mcp:tickets:write",
        isMutation: true,
        summary: "Post staff reply and email the merchant automatically.",
      },
      {
        name: "edit_ticket_message",
        domain: "Support Ticket Operations",
        scope: "mcp:tickets:write",
        isMutation: true,
        summary: "Rewrite a staff message already in the thread (no new email).",
      },
      {
        name: "delete_ticket_message",
        domain: "Support Ticket Operations",
        scope: "mcp:tickets:write",
        isMutation: true,
        summary: "Delete a staff message and its files from the thread.",
      },
      {
        name: "update_ticket_status",
        domain: "Support Ticket Operations",
        scope: "mcp:tickets:write",
        isMutation: true,
        summary: "Close or reopen a customer support ticket.",
      },
      {
        name: "create_ticket",
        domain: "Support Ticket Operations",
        scope: "mcp:tickets:write",
        isMutation: true,
        summary: "Open a support ticket on behalf of a merchant.",
      },
    ],
  },
  {
    domain: "Campaigns",
    tools: [
      {
        name: "list_campaigns",
        domain: "Campaigns",
        scope: "mcp:read",
        isMutation: false,
        summary: "List announcements by status, newest first.",
      },
      {
        name: "get_campaign",
        domain: "Campaigns",
        scope: "mcp:read",
        isMutation: false,
        summary: "Full words, audience, status, delivery counts and a bounded recipient sample.",
      },
      {
        name: "preview_campaign_audience",
        domain: "Campaigns",
        scope: "mcp:read",
        isMutation: false,
        summary: "Size an audience (recipients, unsubscribed, no address) before a draft exists.",
      },
      {
        name: "create_campaign",
        domain: "Campaigns",
        scope: "mcp:campaigns:write",
        isMutation: true,
        summary: "Write a draft announcement. Sends nothing; returns the real recipient count.",
      },
      {
        name: "update_campaign",
        domain: "Campaigns",
        scope: "mcp:campaigns:write",
        isMutation: true,
        summary: "Edit a draft's words, button or audience.",
      },
      {
        name: "delete_campaign",
        domain: "Campaigns",
        scope: "mcp:campaigns:write",
        isMutation: true,
        summary: "Delete a draft that was never sent.",
      },
      {
        name: "send_campaign_test",
        domain: "Campaigns",
        scope: "mcp:campaigns:write",
        isMutation: true,
        summary: "Email a [Test] copy to the token owner only.",
      },
      {
        name: "pause_campaign",
        domain: "Campaigns",
        scope: "mcp:campaigns:write",
        isMutation: true,
        summary: "Pause a sending campaign; waiting merchants keep their place.",
      },
      {
        name: "resume_campaign",
        domain: "Campaigns",
        scope: "mcp:campaigns:write",
        isMutation: true,
        summary: "Resume a paused campaign (mails merchants again).",
      },
      {
        name: "cancel_campaign",
        domain: "Campaigns",
        scope: "mcp:campaigns:write",
        isMutation: true,
        summary: "End a campaign for good; mail already sent cannot be recalled.",
      },
      {
        name: "start_campaign",
        domain: "Campaigns",
        scope: "mcp:campaigns:send",
        isMutation: true,
        summary: "EMAILS REAL MERCHANTS and cannot be undone. Needs the approved recipient count.",
      },
    ],
  },
  {
    domain: "Security & Audit",
    tools: [
      {
        name: "list_audit_logs",
        domain: "Security & Audit",
        scope: "mcp:admin",
        isMutation: false,
        summary: "Inspect recent MCP tool and API invocations.",
      },
    ],
  },
];
