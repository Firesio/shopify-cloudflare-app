import { useTranslation } from "react-i18next";

import { SkeletonStatus, SkeletonText } from "~/components/admin/Skeleton";
import { trendOf } from "~/domain/metric-trend";
import { formatMoney, formatNumber, formatRelativeTime } from "~/i18n/format";
import { useLanguage } from "~/i18n/useLanguage";
import { MetricCard, type MetricReading } from "./MetricCard";

export type DashboardChannel = {
  readonly key: string;
  readonly label: string;
  readonly sales: number;
  readonly orders: number;
};

/** A metric's value and its fractional change against the previous period (0.125 is +12.5%). */
export type DashboardMetric = { readonly value: number; readonly change: number };

export type DashboardPerformance = {
  /** Sales in integer minor units of `currency`. */
  readonly sales: DashboardMetric;
  readonly orders: DashboardMetric;
  /** A fraction (0.042 is 4.2%). */
  readonly conversion: DashboardMetric;
  readonly currency: string;
};

/** How many rows a loading table shows: a guess at the loaded count, which is only known once the data is. */
const LOADING_TABLE_ROWS = 3;
const PERIOD_DAYS = 30;

type Format = (value: number) => string;

/**
 * Each export renders an `s-section`, a direct child of `s-page` once rendered. Each takes its data or `"loading"`, and
 * renders the SAME markup either way: the heading, the labels and the links are real at once, and only the values are
 * skeletons while the data is on its way.
 */
export function PerformanceSection({ performance }: { performance: DashboardPerformance | "loading" }) {
  const { t } = useTranslation("admin");
  const language = useLanguage();
  const percent = (value: number) => formatNumber(language, value, { style: "percent", minimumFractionDigits: 1, signDisplay: "exceptZero" });
  const reading = (metric: DashboardMetric, format: Format): MetricReading => ({
    value: format(metric.value),
    change: percent(metric.change),
    trend: trendOf(metric.change),
  });
  const loaded = performance === "loading" ? undefined : performance;
  return (
    <s-section
      heading={t("dashboard.performanceWithPeriod", { period: t("dashboard.period", { days: formatNumber(language, PERIOD_DAYS) }) })}
      padding="base"
    >
      <s-grid gridTemplateColumns="@container (inline-size <= 400px) 1fr, 1fr auto 1fr auto 1fr" gap="small">
        <MetricCard
          label={t("dashboard.sales")}
          href="/admin/analytics"
          reading={loaded ? reading(loaded.sales, (value) => formatMoney(language, value, loaded.currency)) : "loading"}
        />
        <s-divider direction="block"></s-divider>
        <MetricCard label={t("dashboard.orders")} href="/admin/orders" reading={loaded ? reading(loaded.orders, (value) => formatNumber(language, value)) : "loading"} />
        <s-divider direction="block"></s-divider>
        <MetricCard
          label={t("dashboard.conversion")}
          href="/admin/analytics"
          reading={loaded ? reading(loaded.conversion, (value) => formatNumber(language, value, { style: "percent", minimumFractionDigits: 1 })) : "loading"}
        />
      </s-grid>
      {performance === "loading" ? <SkeletonStatus label={t("dashboard.performanceLoading")} /> : null}
    </s-section>
  );
}

export function ChannelsSection({
  channels,
  currency,
  expectedRows = LOADING_TABLE_ROWS,
}: {
  /** The channels, or `"loading"` while they are on their way. */
  readonly channels: readonly DashboardChannel[] | "loading";
  readonly currency: string;
  /** Skeleton rows to show while loading; match what the loaded table usually has. */
  readonly expectedRows?: number;
}) {
  const { t } = useTranslation("admin");
  const language = useLanguage();
  if (channels !== "loading" && channels.length === 0) {
    return (
      <s-section heading={t("dashboard.channelPerformance")}>
        <s-empty-state heading={t("dashboard.channelsEmptyHeading")}>
          <s-icon slot="graphic" type="channels"></s-icon>
          <s-text slot="subheading">{t("dashboard.channelsEmptyBody")}</s-text>
        </s-empty-state>
      </s-section>
    );
  }
  return (
    <s-section heading={t("dashboard.channelPerformance")} padding="none">
      <s-table variant="auto">
        <s-table-header-row>
          <s-table-header listSlot="primary">{t("dashboard.channel")}</s-table-header>
          <s-table-header listSlot="labeled" format="currency">
            {t("dashboard.channelSales")}
          </s-table-header>
          <s-table-header listSlot="labeled" format="numeric">
            {t("dashboard.channelOrders")}
          </s-table-header>
        </s-table-header-row>
        <s-table-body>
          {channels === "loading"
            ? Array.from({ length: Math.max(1, expectedRows) }, (_, index) => (
                <s-table-row key={index}>
                  <s-table-cell><SkeletonText chars={14} /></s-table-cell>
                  <s-table-cell><SkeletonText chars={9} /></s-table-cell>
                  <s-table-cell><SkeletonText chars={4} /></s-table-cell>
                </s-table-row>
              ))
            : channels.map((channel) => (
                <s-table-row key={channel.key}>
                  <s-table-cell>{channel.label}</s-table-cell>
                  <s-table-cell>{formatMoney(language, channel.sales, currency)}</s-table-cell>
                  <s-table-cell>{formatNumber(language, channel.orders)}</s-table-cell>
                </s-table-row>
              ))}
        </s-table-body>
      </s-table>
      {channels === "loading" ? <SkeletonStatus label={t("dashboard.channelsLoading")} /> : null}
    </s-section>
  );
}

/** Sample activity only: rendered by `SampleDashboard`, replaced with the real app. */
export function RecentActivitySection() {
  const { t } = useTranslation("admin");
  const language = useLanguage();
  return (
    <s-section heading={t("dashboard.recentActivity")}>
      <s-stack gap="small-300">
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-icon type="package-fulfilled" tone="success"></s-icon>
          <s-text type="strong">{t("dashboard.activity.order", { number: "1048" })}</s-text>
          <s-text color="subdued">{t("dashboard.activity.orderBody", { when: formatRelativeTime(language, -2, "minute") })}</s-text>
        </s-stack>
        <s-divider></s-divider>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-icon type="person-add" tone="info"></s-icon>
          <s-text type="strong">{t("dashboard.activity.customer")}</s-text>
          <s-text color="subdued">{t("dashboard.activity.customerBody", { when: formatRelativeTime(language, -18, "minute") })}</s-text>
        </s-stack>
        <s-divider></s-divider>
        <s-stack direction="inline" gap="small-200" alignItems="center">
          <s-icon type="megaphone" tone="auto"></s-icon>
          <s-text type="strong">{t("dashboard.activity.promotion")}</s-text>
          <s-text color="subdued">{t("dashboard.activity.promotionBody", { when: formatRelativeTime(language, -1, "hour") })}</s-text>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
