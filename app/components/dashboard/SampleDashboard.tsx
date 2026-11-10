import { useTranslation } from "react-i18next";

import { ChannelsSection, PerformanceSection, RecentActivitySection, type DashboardPerformance } from "./DashboardSections";

/**
 * SAMPLE DATA — a placeholder for the template, never a real app's dashboard.
 *
 * Every number, trend and activity line here is invented so the layout has
 * something to show. App Store requirement 1.1.4 forbids showing a merchant
 * fabricated store data, so `npm run check:placeholders` refuses to deploy
 * production while any route under `app/routes/` imports this file. Replace it
 * with sections fed by the shop's real data (or the empty-state composition),
 * then delete this file and the `dashboard.activity` copy. The sections already
 * take `"loading"` for the stretch while real data streams in.
 */
const SAMPLE_PERFORMANCE = {
  sales: { value: 184_260, change: 0.125 },
  orders: { value: 328, change: 0.082 },
  conversion: { value: 0.042, change: 0.007 },
  currency: "USD",
} satisfies DashboardPerformance;

const SAMPLE_CHANNELS = [
  { key: "onlineStore", sales: 128_400, orders: 221 },
  { key: "shopApp", sales: 42_360, orders: 76 },
  { key: "social", sales: 13_500, orders: 31 },
] as const;

export function SampleDashboard() {
  const { t } = useTranslation("admin");
  const channels = SAMPLE_CHANNELS.map((channel) => ({
    ...channel,
    label: t(`dashboard.${channel.key}`),
  }));
  return (
    <>
      <PerformanceSection performance={SAMPLE_PERFORMANCE} />
      <ChannelsSection channels={channels} currency={SAMPLE_PERFORMANCE.currency} />
      <RecentActivitySection />
    </>
  );
}
