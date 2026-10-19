import { useTranslation } from "react-i18next";

import { ChannelsSection, PerformanceSection, RecentActivitySection } from "./DashboardSections";

/**
 * SAMPLE DATA — a placeholder for the template, never a real app's dashboard.
 *
 * Every number, trend and activity line here is invented so the layout has
 * something to show. App Store requirement 1.1.4 forbids showing a merchant
 * fabricated store data, so `npm run check:placeholders` refuses to deploy
 * production while any route under `app/routes/` imports this file. Replace it
 * with sections fed by the shop's real data (or the empty-state composition),
 * then delete this file and the `dashboard.activity` / `*Change*` copy.
 */
const SAMPLE = {
  sales: 184_260,
  orders: 328,
  conversion: 0.042,
  currency: "USD",
  channels: [
    { key: "onlineStore", sales: 128_400, orders: 221 },
    { key: "shopApp", sales: 42_360, orders: 76 },
    { key: "social", sales: 13_500, orders: 31 },
  ],
} satisfies {
  sales: number;
  orders: number;
  conversion: number;
  currency: string;
  channels: readonly { key: "onlineStore" | "shopApp" | "social"; sales: number; orders: number }[];
};

export function SampleDashboard() {
  const { t } = useTranslation("admin");
  const channels = SAMPLE.channels.map((channel) => ({
    ...channel,
    label: t(`dashboard.${channel.key}`),
  }));
  return (
    <>
      <PerformanceSection metrics={SAMPLE} currency={SAMPLE.currency} />
      <ChannelsSection channels={channels} currency={SAMPLE.currency} />
      <RecentActivitySection />
    </>
  );
}
