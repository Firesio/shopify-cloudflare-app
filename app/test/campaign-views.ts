import { DEFAULT_AUDIENCE, type AudiencePreview } from "~/domain/campaign-audience";
import type { Campaign, CampaignRecipient, CampaignSummary } from "~/ports/campaigns";

/** An announcement as a page is given it. Override what a test is about. */
export function campaignFixture(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "campaign-1",
    name: "Big update",
    subject: "A big update is coming",
    body: "Next week we ship a redesigned dashboard.\n\nNothing changes until you open it.",
    ctaLabel: "See what is new",
    ctaUrl: "https://firesio.app/news",
    audience: DEFAULT_AUDIENCE,
    status: "draft",
    pauseReason: null,
    recipientCount: null,
    createdBy: "admin-1",
    createdByEmail: "writer@firesio.app",
    createdAt: Date.UTC(2026, 10, 2, 9, 30),
    updatedAt: Date.UTC(2026, 10, 2, 9, 45),
    startedAt: null,
    completedAt: null,
    lastPumpAt: null,
    ...overrides,
  };
}

export function summaryFixture(overrides: Partial<CampaignSummary> = {}): CampaignSummary {
  const { id, name, subject, status, pauseReason, recipientCount, createdByEmail, createdAt, startedAt, completedAt } = campaignFixture();
  return { id, name, subject, status, pauseReason, recipientCount, createdByEmail, createdAt, startedAt, completedAt, ...overrides };
}

export function previewFixture(overrides: Partial<AudiencePreview> = {}): AudiencePreview {
  return {
    matched: 12,
    withoutAddress: 1,
    unsubscribed: 2,
    recipients: 9,
    sample: [
      { shop: "a.myshopify.com", name: "Alpha Goods", email: "alpha@firesio.app" },
      { shop: "b.myshopify.com", name: "Beta Wares", email: "beta@firesio.app" },
    ],
    ...overrides,
  };
}

export function recipientFixture(overrides: Partial<CampaignRecipient> = {}): CampaignRecipient {
  return { shop: "a.myshopify.com", shopName: "Alpha Goods", email: "alpha@firesio.app", status: "sent", reasonCode: null, attempts: 1, settledAt: Date.UTC(2026, 10, 3, 8, 0), ...overrides };
}
