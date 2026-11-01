import { useTranslation } from "react-i18next";

import { useLanguage } from "~/i18n/useLanguage";
import { formatMoney } from "~/money";
import { annualSavingPercent } from "~/billing/annual-savings";
import type { Plan } from "~/billing/plans";

/**
 * One plan, as a card, built only from Polaris web components. Polaris 2 gives `s-text` a font size, weight and tabular
 * numerals, so the price can be the heaviest thing on the card without any CSS of our own, and the card follows
 * whichever admin theme the merchant is using. (Earlier versions drew this by hand with a copied palette, which is what
 * Shopify's Polaris 2 guide says to remove: copied colours pin a card to the old look.)
 */

type PlanCardProps = {
  plan: Plan;
  buildsOn: Plan | null;
  isCurrent: boolean;
  isFeatured: boolean;
  illustrationSrc?: string;
  illustrationAlt?: string;
};

/** At most one badge per card, so they never stack or compete. */
function PlanBadge({ isCurrent, isFeatured }: Pick<PlanCardProps, "isCurrent" | "isFeatured">) {
  const { t } = useTranslation(["admin", "common"]);
  if (isCurrent) return <s-badge tone="success" icon="check-circle">{t("billing.currentPlanBadge")}</s-badge>;
  if (!isFeatured) return null;
  return <s-badge tone="info" icon="star">{t("billing.plans.mostPopular")}</s-badge>;
}

/**
 * The annual line earns its place by saying what it saves, worked out
 * from the two catalogue prices — never a written-down number that
 * can drift from them.
 */
function AnnualLine({ plan }: { plan: Plan }) {
  const { t } = useTranslation(["admin", "common"]);
  const language = useLanguage();
  const savingPercent = annualSavingPercent(plan);
  const price = formatMoney(language, plan.priceAnnual);

  if (plan.priceMonthly.amount <= 0) return <>{t("billing.plans.freeForever")}</>;
  if (savingPercent === null) return <>{t("billing.plans.annual", { price })}</>;
  return <>{t("billing.plans.annualSaving", { price, percent: savingPercent })}</>;
}

function PlanHead({ plan }: { plan: Plan }) {
  const { t } = useTranslation(["admin", "common"]);
  const language = useLanguage();
  const isPaid = plan.priceMonthly.amount > 0;
  return (
    <s-stack gap="small-200">
      <s-text type="strong">{plan.name}</s-text>
      {/* The amount is the hero and carries the weight; the interval sits subdued beside it so the two read as one figure. */}
      <s-stack direction="inline" gap="small-200" alignItems="baseline">
        <s-text fontSize="large-100" fontWeight="bold" fontVariantNumeric="tabular-nums">{formatMoney(language, plan.priceMonthly)}</s-text>
        {isPaid && <s-text color="subdued">{t("billing.plans.perMonth")}</s-text>}
      </s-stack>
      <s-text color="subdued" fontSize="small">
        <AnnualLine plan={plan} />
      </s-text>
    </s-stack>
  );
}

/** No per-card action: changing plan is one job with one owner, at the top of the page. */
function PlanFeatures({ plan, buildsOn }: Pick<PlanCardProps, "plan" | "buildsOn">) {
  const { t } = useTranslation(["admin", "common"]);
  return (
    <s-stack gap="small-200">
      {buildsOn && <s-text type="strong" fontSize="small">{t("billing.plans.buildsOn", { plan: buildsOn.name })}</s-text>}
      {plan.featureKeys.map((key) => (
        <s-stack key={key} direction="inline" gap="small-200" alignItems="start">
          <s-icon type="check" tone="success"></s-icon>
          <s-text>{t(`common:plans.${key}`)}</s-text>
        </s-stack>
      ))}
    </s-stack>
  );
}

/**
 * Reading order is the order a merchant decides in: which plan, what it costs, what it adds. The feature list is only
 * ever what this plan adds over the one below it, introduced by "Everything in X, plus", so a four-plan ladder never
 * makes the merchant re-read the same six bullets four times.
 */
export function PlanCard({ plan, buildsOn, isCurrent, isFeatured, illustrationSrc, illustrationAlt }: PlanCardProps) {
  return (
    <s-box border={isCurrent ? "large" : "base"} borderRadius="large" padding="large" background={isCurrent ? "subdued" : "base"}>
      <s-stack gap="base">
        <PlanBadge isCurrent={isCurrent} isFeatured={isFeatured} />
        {illustrationSrc && illustrationAlt && (
          <s-image src={illustrationSrc} alt={illustrationAlt} aspectRatio="1/1" objectFit="contain" loading="lazy"></s-image>
        )}
        <PlanHead plan={plan} />
        <s-divider></s-divider>
        <PlanFeatures plan={plan} buildsOn={buildsOn} />
      </s-stack>
    </s-box>
  );
}
