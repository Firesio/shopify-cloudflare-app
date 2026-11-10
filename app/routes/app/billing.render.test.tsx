import { describe, it, expect } from "vitest";
import { fromMinorUnits, toCurrency } from "~/money";
import { err, ok, unwrap } from "~/lib/result";
import type { Outcome } from "~/admin/outcome";
import { renderRoute } from "~/test/render-route";
import type { BillingStatus } from "~/billing/subscription-status";
import Billing from "./billing";
import { PLANS, type PlanHandle } from "~/billing/plans";

const money = (minor: number, code = "USD") => unwrap(fromMinorUnits(minor, unwrap(toCurrency(code))));
const price = (minor: number) => money(minor);

type Subscribed = Extract<BillingStatus, { kind: "subscribed" }>;

const subscribed = (over: Partial<Subscribed> = {}): BillingStatus => ({
  kind: "subscribed",
  phase: "active",
  name: "TODO:PRO",
  price: price(2999),
  interval: "every_30_days",
  trialEndsAt: null,
  currentPeriodEndsAt: Date.parse("2026-12-01T00:00:00.000Z"),
  cancelsOn: null,
  ...over,
});

type RenderOptions = {
  readonly locale?: "en" | "es";
  readonly currentPlanHandle?: PlanHandle | null;
  readonly promo?: { handle: PlanHandle; name: string; remainingDays: number } | null;
  readonly planLink?: Outcome<string | null>;
};

/**
 * The "Your plan" section.
 *
 * The Polaris elements render as inert tags here, so what is asserted is what
 * the page DECIDED: which plan name, which price line, which status, which
 * action — and particularly the money, where showing a figure the merchant is
 * not being charged is the failure this section's pure helpers exist to prevent.
 * How Polaris draws it is verified by hand, not here (@rules/testing.md).
 */
async function render(status: BillingStatus, options: RenderOptions = {}) {
  const { locale = "en", currentPlanHandle = status.kind === "free" ? "free" : null, promo = null, planLink = ok(PLAN_LINK) } = options;
  return renderBilling(
    { pricingReturn: false, plan: Promise.resolve(ok({ status, currentPlanHandle, promo })), planLink: Promise.resolve(planLink) },
    "settled",
    locale,
  );
}

const PLAN_LINK = "https://admin.shopify.com/plans";
const FAILED: Outcome<never> = err("failed");

function renderBilling(loaderData: unknown, stage: "pending" | "settled", locale: "en" | "es" = "en") {
  return renderRoute({ path: "/app/billing", Component: Billing, loaderData, stage, locale });
}

/** The markup of one catalogue card, found by its plan name. */
function cardOf(html: string, planName: string): string {
  const card = html.slice(html.indexOf('<s-section heading="Plans"')).split("<s-box border=").find((part) => part.includes(`<s-heading>${planName}</s-heading>`));
  if (!card) throw new Error(`no card for ${planName}`);
  return card;
}

/** Only the "Your plan" section, so the catalogue's own prices and copy cannot satisfy or break an assertion. */
function summaryOf(html: string): string {
  return html.slice(0, html.indexOf('<s-section heading="Plans"'));
}

describe("the current-plan section", () => {
  it("labels the free plan, says it is free, and offers the upgrade", async () => {
    const summary = summaryOf(await render({ kind: "free" }));

    expect(summary).toContain("Your plan");
    expect(summary).toContain(`<s-heading>${PLANS.free.name}</s-heading>`);
    expect(summary).toContain(">Free<");
    // The catalogue is USD: the free line must not print a catalogue currency amount.
    expect(summary).not.toContain("$0.00");
    expect(summary).toContain("Upgrade");
  });

  it("says who manages plans, so leaving the app is not a surprise", async () => {
    const html = await render({ kind: "free" });
    expect(html).toContain("Plans are managed by Shopify. Use the button above");
  });

  it("offers to manage, not upgrade, once subscribed", async () => {
    const html = await render(subscribed());

    expect(html).toContain("Manage plan");
    expect(html).not.toContain(">Upgrade<");
  });

  it("quotes a monthly subscriber a monthly figure", async () => {
    expect(summaryOf(await render(subscribed({ interval: "every_30_days" })))).toContain("$29.99/mo");
  });

  it("quotes an ANNUAL subscriber the annual figure, never a monthly one", async () => {
    // Labelling a yearly charge "/mo" misstates what leaves their account.
    const summary = summaryOf(await render(subscribed({ interval: "annual", price: price(29900) })));

    expect(summary).toContain("$299.00/yr");
    expect(summary).not.toContain("$299.00/mo");
  });

  it("shows the figure with NO cadence when Shopify reported no interval", async () => {
    const summary = summaryOf(await render(subscribed({ interval: null })));

    expect(summary).toContain("$29.99");
    expect(summary).not.toContain("$29.99/mo");
    expect(summary).not.toContain("$29.99/yr");
  });

  it("shows NO figure at all when the subscription carries no price", async () => {
    // A grandfathered or discounted charge must not be quoted at list price.
    const summary = summaryOf(await render(subscribed({ price: null })));

    expect(summary).toContain("TODO:PRO");
    expect(summary).not.toMatch(/\$\d/);
  });

  it("shows the subscription's own currency, not the catalogue's USD", async () => {
    const summary = summaryOf(await render(subscribed({ price: money(1750, "EUR") })));

    expect(summary).toContain("€17.50/mo");
    expect(summary).not.toMatch(/\$\d/);
  });

  it("calls an unrecognised Shopify plan 'Your subscription', never the free plan", async () => {
    const summary = summaryOf(await render(subscribed({ name: null })));

    expect(summary).toContain("<s-heading>Your subscription</s-heading>");
    expect(summary).not.toContain(PLANS.free.name);
    expect(summary).toContain("$29.99/mo");
  });

  it("prints trial and renewal dates as dates, with no time of day", async () => {
    const renews = summaryOf(await render(subscribed()));
    expect(renews).toContain("Renews Dec 1, 2026 for $29.99");
    expect(renews).not.toMatch(/\d:\d\d/);

    const trial = summaryOf(await render(subscribed({ trialEndsAt: Date.parse("2026-11-20T00:00:00.000Z") })));
    expect(trial).toContain("Your free trial ends Nov 20, 2026");
    expect(trial).not.toContain("Renews");
  });

  it("shows no renewal line when the period end is unknown", async () => {
    const summary = summaryOf(await render(subscribed({ currentPeriodEndsAt: null })));
    expect(summary).not.toContain("Renews");
    expect(summary).toContain("Active");
  });

  it("a scheduled cancellation says when access ends and never 'Renews'", async () => {
    const summary = summaryOf(await render(subscribed({ phase: "cancelling", cancelsOn: "2026-12-31" })));

    expect(summary).toContain("Cancelling");
    expect(summary).toContain("Your subscription ends on Dec 31, 2026. You keep access until then.");
    expect(summary).not.toContain("Renews");
    expect(summary).toContain("Manage plan");
  });

  it("a scheduled cancellation without a known date says so without inventing one", async () => {
    const summary = summaryOf(await render(subscribed({ phase: "cancelling", cancelsOn: null })));

    expect(summary).toContain("until the end of the current billing period");
    expect(summary).not.toContain("Renews");
  });

  it.each([
    ["frozen", "Payment frozen", "Your payments are on hold", "Manage plan"],
    ["pending", "Waiting for your approval", "waiting for your approval in Shopify", "Review plan"],
    ["cancelled", "Cancelled", "This subscription was cancelled", "Resubscribe"],
    ["inactive", "Not active", "no active subscription", "Choose a plan"],
  ] as const)("a %s subscription gets its own badge, sentence and button, and no renewal", async (phase, badge, sentence, action) => {
    const summary = summaryOf(await render(subscribed({ phase })));

    expect(summary).toContain(badge);
    expect(summary).toContain(sentence);
    expect(summary).toContain(action);
    expect(summary).not.toContain("Renews");
    expect(summary).not.toContain("free trial");
  });

  it("quotes no charge for a cancelled or inactive subscription", async () => {
    expect(summaryOf(await render(subscribed({ phase: "cancelled" })))).not.toContain("$29.99");
    expect(summaryOf(await render(subscribed({ phase: "inactive" })))).not.toContain("$29.99");
  });

  it("puts the 'Current plan' badge on the card the page was told is current, and only that one", async () => {
    const html = await render(subscribed(), { currentPlanHandle: "pro" });

    expect(cardOf(html, PLANS.pro.name)).toContain("Current plan");
    expect(cardOf(html, PLANS.free.name)).not.toContain("Current plan");
  });

  it("badges Free, not Pro, when the Pro subscription is not granting access", async () => {
    // The loader decides this with currentPlanHandleFor (tested exhaustively); the page just obeys it.
    const html = await render(subscribed({ phase: "pending" }), { currentPlanHandle: "free" });

    expect(cardOf(html, PLANS.free.name)).toContain("Current plan");
    expect(cardOf(html, PLANS.pro.name)).not.toContain("Current plan");
  });

  it("badges no card when the plan is not one of ours", async () => {
    expect(await render(subscribed({ name: null }), { currentPlanHandle: null })).not.toContain("Current plan");
  });

  it("names a promotion as a promotion, apart from the subscription underneath", async () => {
    const html = await render({ kind: "free" }, {
      currentPlanHandle: "pro",
      promo: { handle: "pro", name: PLANS.pro.name, remainingDays: 1 },
    });
    const summary = summaryOf(html);

    expect(summary).toContain(`<s-heading>${PLANS.pro.name}</s-heading>`);
    expect(summary).toContain("Promotion");
    expect(summary).toContain("Promotional access ends tomorrow.");
    // The real subscription is its own, labelled block.
    expect(summary).toContain("Your subscription");
    expect(summary).toContain(`<s-heading>${PLANS.free.name}</s-heading>`);
  });

  it("counts promotion days in the reader's language", async () => {
    const summary = summaryOf(await render({ kind: "free" }, {
      locale: "es",
      currentPlanHandle: "pro",
      promo: { handle: "pro", name: PLANS.pro.name, remainingDays: 5 },
    }));

    expect(summary).toContain("El acceso promocional termina dentro de 5 días.");
  });

  it("says the link is unavailable, and stops pointing at a button that is not there", async () => {
    const html = await render(subscribed(), { planLink: ok(null) });

    expect(html).toContain("The plan link is unavailable right now");
    expect(html).not.toContain("Use the button above");
    expect(html).toContain("changes to your plan are made outside this app");
    expect(html).not.toContain("<s-button variant=\"primary\"");
  });

  it("translates the section rather than hardcoding English", async () => {
    const html = await render({ kind: "free" }, { locale: "es" });

    expect(html).toContain("Tu plan");
    expect(html).toContain(">Gratis<");
    expect(html).not.toContain("Your plan");
    expect(html).not.toContain("Plans are managed by Shopify");
  });

  it("translates every state's status copy", async () => {
    for (const phase of ["active", "cancelling", "frozen", "pending", "cancelled", "inactive"] as const) {
      const summary = summaryOf(await render(subscribed({ phase, cancelsOn: "2026-12-31" }), { locale: "es" }));
      expect(summary, phase).not.toMatch(/Renews|Cancelling|Payment frozen|Waiting for|Not active|You keep access|billing\./);
    }
  });
});

const settledPlan = Promise.resolve(ok({ status: { kind: "free" } satisfies BillingStatus, currentPlanHandle: "free", promo: null }));
const never = new Promise<never>(() => undefined);

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0;
/** The structural skeleton of a page: how many sections, cards, grids, headings and buttons it has. */
const footprint = (html: string) => ({
  sections: count(html, /<s-section[ >]/g),
  grids: count(html, /<s-grid /g),
  cards: count(html, /<s-box border=/g),
  headings: count(html, /<s-heading>/g),
  buttons: count(html, /<s-button[ >]/g),
  images: count(html, /<s-image /g),
});

describe("streaming the billing page", () => {
  const pendingLoader = { pricingReturn: false, plan: never, planLink: never };

  it("renders the real frame, labels, button and plan cards at once, with skeletons only where values go", async () => {
    const html = await renderBilling(pendingLoader, "pending");

    expect(html).toContain('<s-page heading="Billing"');
    // Static parts are the real thing, with their names.
    expect(html).toContain("Your plan");
    expect(html).toContain("Plans are managed by Shopify. Use the button above");
    expect(html).toContain('heading="Plans"');
    for (const plan of Object.values(PLANS)) {
      expect(cardOf(html, plan.name)).toContain(`<s-heading>${plan.name}</s-heading>`);
    }
    expect(html).toContain("Everything in");
    // Values are skeletons; nothing pretends to be known.
    expect(html).toContain('data-skeleton=""');
    expect(html).not.toContain("Current plan");
    expect(html).not.toContain(">Upgrade<");
    expect(html).not.toContain(">Free<");
    expect(html).not.toContain("s-spinner");
    // No button spins: a spinning button means "you started something", and nothing was started here.
    expect(html).not.toMatch(/<s-button[^>]*\sloading/);
  });

  it("announces the wait exactly once for the whole plan region", async () => {
    const html = await renderBilling(pendingLoader, "pending");

    expect(count(html, /accessibilityRole="status"/g)).toBe(1);
    expect(count(html, /Loading your plan/g)).toBe(2); // the section's label and its one status text
    expect(html).not.toContain("Loading plans");
  });

  it("puts a skeleton badge on every plan card, and the card's own text stays", async () => {
    const html = await renderBilling(pendingLoader, "pending");
    for (const plan of Object.values(PLANS)) {
      expect(cardOf(html, plan.name)).toContain('<s-badge data-skeleton=""');
    }
  });

  it("has the same structure pending as loaded: same sections, grids, cards, headings and buttons", async () => {
    const pending = await renderBilling(pendingLoader, "pending");
    const loaded = await render(subscribed(), { currentPlanHandle: "pro" });
    expect(footprint(pending)).toEqual(footprint(loaded));
    expect(footprint(pending).cards).toBe(Object.keys(PLANS).length);
  });

  it("shows a critical banner, never a plausible plan, when the plan failed", async () => {
    const html = await renderBilling({ pricingReturn: false, plan: Promise.resolve(FAILED), planLink: Promise.resolve(ok(PLAN_LINK)) }, "settled");

    expect(html).toContain('tone="critical"');
    expect(html).toContain("We couldn&#x27;t load your plan");
    expect(html).not.toContain("Your plan");
    expect(html).not.toContain("Upgrade");
    expect(html).not.toContain('data-skeleton=""');
    // The page frame survives, so navigation stays usable; the static catalogue stays, with nothing marked current.
    expect(html).toContain('<s-page heading="Billing"');
    expect(html).toContain('heading="Plans"');
    expect(html).not.toContain("Current plan");
  });

  it("keeps the plan and says the link is unavailable when only the plan link failed", async () => {
    const html = await renderBilling({ pricingReturn: false, plan: settledPlan, planLink: Promise.resolve(FAILED) }, "settled");

    expect(html).toContain("Your plan");
    expect(html).toContain("The plan link is unavailable right now");
    expect(html).not.toContain(">Upgrade<");
  });

  it("translates the pending and failed copy", async () => {
    const pending = await renderBilling(pendingLoader, "pending", "es");
    expect(pending).toContain('accessibilityLabel="Cargando tu plan"');
    expect(pending).toContain("Tu plan");
    expect(pending).not.toContain("Loading your plan");

    const failed = await renderBilling({ pricingReturn: false, plan: Promise.resolve(FAILED), planLink: Promise.resolve(FAILED) }, "settled", "es");
    expect(failed).toContain("No pudimos cargar tu plan");
  });

  describe("after returning from Shopify's plan approval", () => {
    it("goes straight to the processing screen without waiting on any region, with skeletons and no spinner", async () => {
      const html = await renderBilling({ pricingReturn: true }, "pending");

      expect(html).toContain('<s-page heading="Updating your plan"');
      expect(html).toContain("Checking the latest details from Shopify");
      expect(html).toContain('data-skeleton=""');
      expect(html).not.toContain("s-spinner");
    });

    it("announces the wait once and shows the plan cards as the real thing", async () => {
      const html = await renderBilling({ pricingReturn: true }, "pending");

      expect(count(html, /accessibilityRole="status"/g)).toBe(1);
      expect(html).toContain('accessibilityLabel="Updating your plan"');
      for (const plan of Object.values(PLANS)) {
        expect(cardOf(html, plan.name)).toContain('<s-badge data-skeleton=""');
      }
    });

    it("translates the processing copy", async () => {
      const html = await renderBilling({ pricingReturn: true }, "pending", "es");
      expect(html).toContain('<s-page heading="Actualizando tu plan"');
      expect(html).not.toContain("Updating your plan");
    });
  });
});
