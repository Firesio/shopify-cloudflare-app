import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useTranslation } from "react-i18next";

import { guardMember } from "~/admin/require-member.server";
import { settle } from "~/admin/settle.server";
import { useActionToast } from "~/admin/use-action-toast";
import type { Outcome } from "~/admin/outcome";
import { Deferred, FailedSection } from "~/components/admin/Deferred";
import { SkeletonBadge, SkeletonStatus, SkeletonText } from "~/components/admin/Skeleton";
import { getEnv } from "~/request-context.server";
import { readAppHandle } from "./billing-app-handle.server";
import { ShopifyAppIdentityAdapter } from "~/adapters/shopify-app-identity.server";
import { useLanguage } from "~/i18n/useLanguage";
import type { LanguageCode } from "~/i18n/catalogues.generated";
import { formatDate, formatRelativeTime } from "~/i18n/format";
import { useTimeZone } from "~/i18n/useTimeZone";
import { UTC } from "~/i18n/time-zone";
import { formatMoney } from "~/money";
import {
  resolveProjectionBillingStatus,
  type BillingStatus,
  type SubscriptionPhase,
} from "~/billing/subscription-status";
import { currentPlanHandleFor } from "~/billing/current-plan";
import {
  PHASE_TONE,
  planActionKind,
  statusLine,
  type PlanActionKind,
  type StatusLine,
} from "~/billing/billing-presentation";
import { planPriceLine, type PlanPriceLine } from "~/billing/plan-price-line";
import { pricingPlansUrl } from "~/billing/pricing-plans-url";
import { FEATURED_PLAN_HANDLE, PLANS, PLAN_LIST, planForShopifyHandle, type PlanHandle } from "~/billing/plans";
import {
  persistShopIdentity,
  planGrants,
  refreshShopHistory,
  refreshShopSubscription,
  shopSubscriptions,
} from "~/wiring.server";
import { PendingButton } from "~/components/billing/PendingButton";
import { PlanCard, type PlanStanding } from "~/components/billing/PlanCard";
import { isPricingReturn } from "~/billing/pricing-return";
import { reconcileShop } from "~/services/reconcile-shop";
import { resolveEffectivePlan } from "~/domain/plan-hierarchy";

export const handle = { i18n: ["common", "admin"] };

type BillingReconciliationResponse = { readonly ok: true } | { readonly ok: false };

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await guardMember(request, "billing:manage");
  await persistShopIdentity(admin, session.shop);
  const result = await reconcileShop({
    refreshSubscription: () => refreshShopSubscription(getEnv(), session.shop),
    refreshHistory: () => refreshShopHistory(getEnv(), session.shop),
  });
  return result.status === "succeeded"
    ? data<BillingReconciliationResponse>({ ok: true })
    : data<BillingReconciliationResponse>({ ok: false }, { status: 502 });
};

/** The headline: which plan the shop is on. D1 only, so it is cheap, but it is still streamed with the rest. */
async function readPlan(shop: string) {
  // Shop identity is persisted once by the /app layout loader on the document load.
  // Shopify owns the actual subscribe/upgrade/cancel flow (Managed Pricing);
  // this page only ever reads status. There's no in-app request()/cancel() —
  // Partner history projects entitlement changes, and D1 serves normal visits.
  const now = Date.now();
  const [projection, activeGrant] = await Promise.all([
    shopSubscriptions().currentForShop(shop),
    planGrants().findActiveGrant(shop, now),
  ]);
  const effective = resolveEffectivePlan(
    projection?.planHandle,
    projection?.status,
    activeGrant,
    PLAN_LIST,
    now,
  );
  // A handle we do not know has NO name: the page says "Your subscription", never the free plan's name.
  const status = resolveProjectionBillingStatus(projection, planForShopifyHandle(projection?.planHandle)?.name ?? null, now);

  const promo = effective.source === "promo" && effective.activePromo
    ? {
        handle: effective.planHandle,
        name: PLANS[effective.planHandle].name,
        remainingDays: effective.activePromo.remainingDays,
      }
    : null;

  const currentPlanHandle = currentPlanHandleFor({
    status,
    planHandle: projection?.planHandle ?? null,
    promoHandle: promo?.handle ?? null,
  });
  return { status, currentPlanHandle, promo };
}

type PlanLinkSource = {
  readonly shop: string;
  readonly env: ReturnType<typeof getEnv>;
  readonly graphql: (query: string) => Promise<Response>;
};

/** The hosted plan-selection URL. Needs the app handle (KV, else an Admin API call), so it is the slow part. */
async function readPlanLink({ shop, env, graphql }: PlanLinkSource): Promise<string | null> {
  const appHandle = await readAppHandle({
    kv: env.SESSION,
    shop,
    fetchHandle: async () => {
      const identity = await new ShopifyAppIdentityAdapter({
        graphql,
        expectedApiKey: env.SHOPIFY_API_KEY || null,
        expectedAppId: env.SHOPIFY_PARTNER_APP_ID || null,
      }).current();
      return identity.handle;
    },
  });
  return appHandle ? pricingPlansUrl(shop, appHandle) : null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authentication is awaited: Shopify requires a valid session token on every
  // request, and its redirect / bounce responses must keep working.
  const { admin, session } = await guardMember(request, "billing:manage");
  if (isPricingReturn(request.url)) return { pricingReturn: true as const };

  const env = getEnv();
  const where = { shop: session.shop, route: "app/billing" };
  // Streamed, so the page frame renders now. The plan and the plan link fail
  // independently: with no link the page still shows the plan, minus the button.
  return {
    pricingReturn: false as const,
    plan: settle(readPlan(session.shop), { event: "admin.billing.plan.failed", ...where }),
    planLink: settle(
      readPlanLink({ shop: session.shop, env, graphql: (query) => admin.graphql(query) }),
      { event: "admin.billing.plan_link.failed", ...where },
    ),
  };
};


type Plan = Awaited<ReturnType<typeof readPlan>>;
type PlanLink = Promise<Outcome<string | null>>;

/**
 * Literal maps, not template literals: `t()` is typed against the `en` files,
 * so a missing message fails the build instead of rendering a raw key to a
 * merchant (@rules/i18n.md).
 */
const PHASE_LABEL = {
  active: "billing.phase.active",
  cancelling: "billing.phase.cancelling",
  frozen: "billing.phase.frozen",
  pending: "billing.phase.pending",
  cancelled: "billing.phase.cancelled",
  inactive: "billing.phase.inactive",
} as const satisfies Record<SubscriptionPhase, string>;

const ACTION_LABEL = {
  upgrade: "billing.upgrade",
  manage: "billing.manage",
  review: "billing.reviewPlan",
  resubscribe: "billing.resubscribe",
  choose: "billing.choosePlan",
} as const satisfies Record<PlanActionKind, string>;

function PriceLine({ line }: { line: PlanPriceLine }) {
  const { t } = useTranslation(["admin", "common"]);
  const language = useLanguage();
  // The subscription's own money in Shopify's currency; the catalogue's (USD) is never substituted.
  if (line.cadence === "free") return <s-text color="subdued">{t("billing.price.free")}</s-text>;
  const price = formatMoney(language, line.price);
  const text =
    line.cadence === "monthly" ? t("billing.price.perMonth", { price })
    : line.cadence === "yearly" ? t("billing.price.perYear", { price })
    : t("billing.price.flat", { price });
  return <s-text color="subdued">{text}</s-text>;
}

function statusLineText(
  t: ReturnType<typeof useTranslation<["admin", "common"]>>["t"],
  language: LanguageCode,
  timeZone: string,
  line: StatusLine,
): string {
  switch (line.kind) {
    case "trial": {
      // Trial, renewal and cancellation are calendar dates: no time of day, in the shop's zone.
      const date = formatDate(language, line.endsAt, timeZone);
      return line.price
        ? t("billing.current.trial", { date, price: formatMoney(language, line.price) })
        : t("billing.current.trialUnknownPrice", { date });
    }
    case "renews": {
      const date = formatDate(language, line.at, timeZone);
      return line.price
        ? t("billing.current.renews", { date, price: formatMoney(language, line.price) })
        : t("billing.current.renewsUnknownPrice", { date });
    }
    // Partner's cancellation date is a date, not an instant: print the day it names, in UTC, in every zone.
    case "cancelsOn": return t("billing.current.cancelsOn", { date: formatDate(language, line.instant, UTC) });
    case "cancelsAtPeriodEnd": return t("billing.current.cancelsAtPeriodEnd");
    case "frozen": return t("billing.current.frozen");
    case "pending": return t("billing.current.pending");
    case "cancelled": return t("billing.current.cancelled");
    case "inactive": return t("billing.current.inactive");
  }
}

function StatusText({ line }: { line: StatusLine }) {
  const { t } = useTranslation(["admin", "common"]);
  const language = useLanguage();
  const timeZone = useTimeZone();
  return <s-text color="subdued">{statusLineText(t, language, timeZone, line)}</s-text>;
}

/** Roughly how many characters each pending value of the summary has once loaded (a plan name, a badge, a price, a renewal sentence). */
const PENDING_CHARS = { name: 10, badge: 8, price: 10, line: 32, button: 12 } as const;

/**
 * The plan Shopify bills the shop for (or the free plan), with its status, price and what happens next. While the plan is
 * on its way (`"loading"`) the label is real and each value is a skeleton in the same rows. The skeleton assumes the
 * common shape (name, badge, price, one status line); a loaded plan that has no price or no status line is shorter.
 */
function SubscriptionBlock({ status, label }: { status: BillingStatus | "loading"; label: string }) {
  const { t } = useTranslation(["admin", "common"]);
  if (status === "loading") {
    return (
      <s-stack direction="block" gap="small-300">
        <s-text color="subdued">{label}</s-text>
        <s-stack direction="inline" gap="small" alignItems="center">
          <SkeletonText heading chars={PENDING_CHARS.name} />
          <SkeletonBadge chars={PENDING_CHARS.badge} />
        </s-stack>
        <SkeletonText chars={PENDING_CHARS.price} />
        <SkeletonText chars={PENDING_CHARS.line} />
      </s-stack>
    );
  }
  const priceLine = planPriceLine(status);
  const line = statusLine(status);
  const name = status.kind === "free" ? PLANS.free.name : (status.name ?? t("billing.subscriptionFallbackName"));
  return (
    <s-stack direction="block" gap="small-300">
      <s-text color="subdued">{label}</s-text>
      <s-stack direction="inline" gap="small" alignItems="center">
        <s-heading>{name}</s-heading>
        {status.kind === "subscribed" && (
          <s-badge tone={PHASE_TONE[status.phase]}>{t(PHASE_LABEL[status.phase])}</s-badge>
        )}
      </s-stack>
      {/* Absent entirely when Shopify reported no amount or nothing is being charged — see
          ~/billing/plan-price-line for why a fallback would be a lie. */}
      {priceLine && <PriceLine line={priceLine} />}
      {line && <StatusText line={line} />}
    </s-stack>
  );
}

/** A promotional grant that lifts the shop above its subscription: named as a promotion, with when it ends. */
function PromoBlock({ promo }: { promo: NonNullable<Plan["promo"]> }) {
  const { t } = useTranslation(["admin", "common"]);
  const language = useLanguage();
  return (
    <s-stack direction="block" gap="small-300">
      <s-text color="subdued">{t("billing.planLabel")}</s-text>
      <s-stack direction="inline" gap="small" alignItems="center">
        <s-heading>{promo.name}</s-heading>
        <s-badge tone="success">{t("billing.promoBadge")}</s-badge>
      </s-stack>
      <s-text color="subdued">
        {t("billing.promoEnds", { when: formatRelativeTime(language, promo.remainingDays, "day") })}
      </s-text>
    </s-stack>
  );
}

function PlanLinkUnavailable() {
  const { t } = useTranslation(["admin", "common"]);
  return <s-text color="subdued">{t("billing.planLinkUnavailable")}</s-text>;
}

/**
 * The one button, labelled by what the merchant can do (`planActionKind`), so before the plan is known its label is
 * unknown too: a skeleton button. Its URL is the slow part of the page, so while that is pending the button is a
 * skeleton of the real label's width: the column keeps its width and nothing reflows when the link arrives. With no
 * URL (the lookup failed, or came back empty) the merchant is told so rather than shown nothing.
 */
function PlanAction({ status, planLink }: { status: BillingStatus | "loading"; planLink: PlanLink }) {
  const { t } = useTranslation(["admin", "common"]);
  if (status === "loading") return <PendingButton chars={PENDING_CHARS.button} />;
  const label = t(ACTION_LABEL[planActionKind(status)]);
  return (
    <Deferred
      resolve={planLink}
      pending={<PendingButton chars={label.length} />}
      failed={<PlanLinkUnavailable />}
    >
      {(url) => (url ? <s-button variant="primary" href={url} target="_top">{label}</s-button> : <PlanLinkUnavailable />)}
    </Deferred>
  );
}

/** Says who owns the flow, so leaving the app to change plan is no surprise. It points at the button only when there is one. */
function ManagedNote({ planLink }: { planLink: PlanLink }) {
  const { t } = useTranslation(["admin", "common"]);
  const withButton = <s-paragraph color="subdued">{t("billing.managedNote")}</s-paragraph>;
  return (
    <Deferred
      resolve={planLink}
      pending={withButton}
      failed={<s-paragraph color="subdued">{t("billing.managedNoteNoLink")}</s-paragraph>}
    >
      {(url) => (url ? withButton : <s-paragraph color="subdued">{t("billing.managedNoteNoLink")}</s-paragraph>)}
    </Deferred>
  );
}

type PlanSummaryProps = { readonly plan: Pick<Plan, "status" | "promo"> | "loading"; readonly planLink: PlanLink };

function PlanSummary({ plan, planLink }: PlanSummaryProps) {
  const { t } = useTranslation(["admin", "common"]);
  const status = plan === "loading" ? "loading" : plan.status;
  const promo = plan === "loading" ? null : plan.promo;
  return (
    <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="start">
      <s-stack direction="block" gap="base">
        {promo ? (
          <>
            <PromoBlock promo={promo} />
            {/* Two plans never share one block: the subscription underneath is its own, labelled one. */}
            <SubscriptionBlock status={status} label={t("billing.subscriptionLabel")} />
          </>
        ) : (
          <SubscriptionBlock status={status} label={t("billing.planLabel")} />
        )}
      </s-stack>

      <PlanAction status={status} planLink={planLink} />
    </s-grid>
  );
}

/** "Your plan": the real section, label, grid and note at once; `"loading"` swaps only the values for skeletons, with one announcement. */
function PlanSummarySection({ plan, planLink }: PlanSummaryProps) {
  const { t } = useTranslation(["admin", "common"]);
  return (
    <s-section accessibilityLabel={plan === "loading" ? t("billing.loading") : undefined}>
      <PlanSummary plan={plan} planLink={planLink} />
      <ManagedNote planLink={planLink} />
      {plan === "loading" ? <SkeletonStatus label={t("billing.loading")} /> : null}
    </s-section>
  );
}

/**
 * The catalogue is static (names, prices, features), so every card renders at once. Which one is the merchant's depends
 * on the subscription: `"loading"` gives each card a skeleton badge, `null` (plan unknown or unavailable) no "current" mark.
 */
function PlanCatalog({ currentPlanHandle }: { currentPlanHandle: PlanHandle | null | "loading" }) {
  const { t } = useTranslation(["admin", "common"]);
  const standingOf = (handle: PlanHandle): PlanStanding =>
    currentPlanHandle === "loading" ? "loading" : handle === currentPlanHandle ? "current" : "other";
  return (
    <s-section heading={t("billing.plans.heading")}>
      <s-paragraph color="subdued">{t("billing.plans.body")}</s-paragraph>
      <s-grid gridTemplateColumns="repeat(auto-fit, minmax(16rem, 1fr))" gap="base">
        {PLAN_LIST.map((plan, index) => (
          <PlanCard
            key={plan.handle}
            plan={plan}
            // PLAN_LIST is cheapest-first, so the plan before this one is the
            // one it builds on — which is what "Everything in X, plus" names.
            buildsOn={index > 0 ? PLAN_LIST[index - 1] : null}
            standing={standingOf(plan.handle)}
            isFeatured={plan.handle === FEATURED_PLAN_HANDLE}
          />
        ))}
      </s-grid>
    </s-section>
  );
}

export default function Billing() {
  const loaderData = useLoaderData<typeof loader>();
  const { t } = useTranslation(["admin", "common"]);
  if (loaderData.pricingReturn) return <BillingProcessing />;

  const { plan, planLink } = loaderData;

  return (
    <s-page heading={t("billing.heading")}>
      {/*
        The shape answers the merchant's questions in the order they ask them:
        which plan am I on, what does it cost, what happens next, how do I
        change it. A quiet label, the plan name as the one heavy thing, the
        price and status under it, and the action on the opposite edge —
        top-aligned, so it sits against the plan name. `s-grid` and not an
        inline `s-stack`: the left column must be free to grow and wrap without
        ever pushing the button onto its own row (@rules/polaris-app-home.md §4).

        Every state keeps this structure, so moving from free to paid to
        cancelled changes the words on this page and never its layout.
      */}
      {/*
        One region: the plan decides both the summary and which card is current. While pending, every static part is the
        real component and only the values are skeletons; on failure the summary is the banner and the catalogue (which
        needs no data) stays, with no card marked current.
      */}
      <Deferred
        resolve={plan}
        pending={
          <>
            <PlanSummarySection plan="loading" planLink={planLink} />
            <PlanCatalog currentPlanHandle="loading" />
          </>
        }
        failed={
          <>
            <FailedSection heading={t("billing.loadFailedHeading")} body={t("billing.loadFailedBody")} />
            <PlanCatalog currentPlanHandle={null} />
          </>
        }
      >
        {({ status, promo, currentPlanHandle }) => (
          <>
            <PlanSummarySection plan={{ status, promo }} planLink={planLink} />
            <PlanCatalog currentPlanHandle={currentPlanHandle} />
          </>
        )}
      </Deferred>
    </s-page>
  );
}

function BillingProcessing() {
  const { t } = useTranslation(["admin", "common"]);
  const fetcher = useFetcher<BillingReconciliationResponse>();
  const navigate = useNavigate();
  const busy = fetcher.state !== "idle";
  const result = fetcher.data;
  // Waiting means no failure to report yet: once it failed, nothing is loading and no skeleton may suggest it is.
  const waiting = result?.ok !== false;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data === undefined) {
      void fetcher.submit(null, { method: "post" });
    }
  }, [fetcher]);

  useEffect(() => {
    if (fetcher.data?.ok) void navigate("/app/billing", { replace: true });
  }, [fetcher.data, navigate]);

  // The inline banner below stays the authoritative report; the toast is the transient layer on top.
  useActionToast(
    result,
    result === undefined
      ? undefined
      : result.ok
        ? { success: t("billing.processing.toastDone") }
        : { error: t("billing.processing.toastFailed") },
  );

  return (
    <s-page heading={t("billing.processing.heading")} inlineSize="base">
      <s-section accessibilityLabel={t("billing.processing.statusLabel")}>
        <s-stack direction="block" gap="base">
          {result?.ok === false && (
            <s-banner tone="critical" heading={t("billing.processing.failedHeading")}>
              <s-paragraph>{t("billing.processing.failedBody")}</s-paragraph>
              <s-button
                slot="secondary-actions"
                loading={busy}
                onClick={() => void fetcher.submit(null, { method: "post" })}
              >
                {t("actions.retry", { ns: "common" })}
              </s-button>
            </s-banner>
          )}
          <s-paragraph color="subdued">{t("billing.processing.body")}</s-paragraph>
          {/* The page this one becomes, with its values still to come: the plan is being checked, not shown. */}
          {waiting ? <SubscriptionBlock status="loading" label={t("billing.planLabel")} /> : null}
        </s-stack>
        {waiting ? <SkeletonStatus label={t("billing.processing.statusLabel")} /> : null}
      </s-section>
      <PlanCatalog currentPlanHandle={waiting ? "loading" : null} />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
