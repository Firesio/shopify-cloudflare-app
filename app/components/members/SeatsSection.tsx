import { useTranslation } from "react-i18next";
import type { SeatSummary } from "~/domain/member-team";

/**
 * How many of the plan's seats are in use. Shown only when the plan limits the team: an app that does not limit it has
 * nothing to say. A team past the limit (after a downgrade) is told so plainly, because nobody was removed and the reason
 * a new person cannot join is otherwise invisible.
 */
export function SeatsSection({ seats, canChangePlan }: { readonly seats: SeatSummary; readonly canChangePlan: boolean }) {
  const { t } = useTranslation("admin");
  if (seats.kind === "unlimited") return null;
  const atLimit = seats.left === 0;
  return (
    <s-section heading={t("members.seats.heading")}>
      <s-stack gap="base">
        <s-stack direction="inline" gap="small-200" alignItems="baseline">
          <s-text type="strong" fontVariantNumeric="tabular-nums">
            {t("members.seats.used", { used: seats.used, max: seats.maximum })}
          </s-text>
          {!atLimit && <s-text color="subdued">{t("members.seats.left", { left: seats.left })}</s-text>}
        </s-stack>
        {seats.maximum > 0 && (
          <s-progress value={Math.min(seats.used, seats.maximum)} max={seats.maximum} tone={atLimit ? "critical" : "auto"} accessibilityLabel={t("members.seats.used", { used: seats.used, max: seats.maximum })}></s-progress>
        )}
        {atLimit && (
          <s-banner tone="warning">{seats.over > 0 ? t("members.seats.over", { used: seats.used, max: seats.maximum }) : t("members.seats.full")}</s-banner>
        )}
        {atLimit && canChangePlan && <s-link href="/app/billing">{t("members.seats.changePlan")}</s-link>}
      </s-stack>
    </s-section>
  );
}
