import { operationalHealth, shopifyEvents, adminSessionUsers } from "~/wiring.server";
import { Suspense, lazy, useSyncExternalStore } from "react";
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Dashboard · Staff Console" },
];
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "~/internal/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Progress } from "~/internal/components/ui/progress";
import { formatPercentChange, percentChange } from "~/lib/trend-delta";
import { requireAdminUser } from "~/services/admin-auth.server";
import { adminUsers } from "~/wiring.server";
import { loadDashboardOverview } from "~/services/internal-admin/ops.server";
import { PLAN_LIST } from "~/billing/plans";
import { formatMoney, toCurrency, zero } from "~/money";
import { formatNumber } from "~/i18n/format";
import { ChartsSkeleton, HealthPanel, HealthSkeleton, StatCardsSkeleton } from "./dashboard-panels";
import { Deferred } from "~/internal/components";
import { streamRegion } from "~/internal/stream-region.server";
import { unwrap } from "~/lib/result";
import type { Locale } from "~/i18n/config";

/** The internal console is staff-only and English-only — no i18n here. */
const LOCALE: Locale = "en";
/** Only used when nobody has paid yet — there's no real currency to show, so USD is a display default, not a business decision. */
const NO_REVENUE = zero(unwrap(toCurrency("USD")));

/** A full year, so seasonality is visible and one quiet month is not a trend. */
const TREND_MONTHS = 12;

/**
 * Recharts and the three charts built on it are the heaviest thing this console
 * ships, and none of it is needed to paint the page. Split into its own chunk,
 * requested only in the browser (see `useMountedCharts`), so the stat cards —
 * which are what a staff member usually opens this page for — render
 * immediately instead of waiting on a charting library.
 */
const DashboardCharts = lazy(() => import("~/internal/components/DashboardCharts"));

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Only the auth check is awaited. Every region below is a promise, so the
  // page frame paints at once and each region streams in behind its skeleton.
  const user = await requireAdminUser(request, { users: adminSessionUsers() });

  const overview = streamRegion(
    "dashboard",
    "overview",
    loadDashboardOverview({ trendMonths: TREND_MONTHS, now: Date.now() }),
  );
  const feedback = streamRegion("dashboard", "uninstall_feedback", shopifyEvents().listAllUninstallFeedback());

  return {
    user,
    // Headline numbers: a failure here shows an error, never a plausible zero.
    headline: Promise.all([streamRegion("dashboard", "admin_count", adminUsers().countAll()), overview]).then(
      ([admins, loaded]) => ({ admins, stats: loaded.stats, trend: loaded.trend }),
    ),
    health: streamRegion("dashboard", "health", operationalHealth().read()),
    charts: Promise.all([overview, feedback]).then(([loaded, uninstallFeedback]) => ({
      trend: loaded.trend,
      uninstallFeedback,
    })),
  };
};

export default function Dashboard() {
  const { headline, health, charts } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <Deferred resolve={headline} fallback={<StatCardsSkeleton count={4} />} errorTitle="Headline numbers">
        {({ admins, stats, trend }) => <SectionCards admins={admins} stats={stats} trend={trend} />}
      </Deferred>
      <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
        <Deferred resolve={headline} fallback={<HealthSkeleton />} errorTitle="Plan breakdown">
          {({ stats }) => <PlansCard stats={stats} />}
        </Deferred>
        <Deferred resolve={health} fallback={<HealthSkeleton />} errorTitle="Operational health">
          {(resolved) => <HealthPanel health={resolved} />}
        </Deferred>
      </div>
      <div className="flex flex-col gap-4 px-4 md:gap-6 lg:px-6">
        <Deferred resolve={charts} fallback={<ChartsSkeleton />} errorTitle="Charts and exit feedback">
          {({ trend, uninstallFeedback }) => <ChartsPanel trend={trend} feedback={uninstallFeedback} />}
        </Deferred>
      </div>
    </div>
  );
}

type Stats = Awaited<ReturnType<typeof loadDashboardOverview>>["stats"];
type Trend = Awaited<ReturnType<typeof loadDashboardOverview>>["trend"];

/** dashboard-01's stat cards: a gradient tile per figure, the change as a badge, context in the footer. */
const CARDS_GRID =
  "grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card";

type Goodness = "up" | "down";

/** A change is bad when it moves against what the figure should do. */
function isWorse(change: number, goodWhen: Goodness): boolean {
  return change !== 0 && (goodWhen === "up" ? change < 0 : change > 0);
}

function ChangeBadge({ change, goodWhen }: { change: number; goodWhen: Goodness }) {
  const Icon = change === 0 ? Minus : change < 0 ? TrendingDown : TrendingUp;
  return (
    <Badge variant={isWorse(change, goodWhen) ? "destructive" : "outline"}>
      <Icon />
      {formatPercentChange(change)}
    </Badge>
  );
}

interface Trending {
  /** Percent change against the previous month, or null when there is nothing to compare. */
  readonly change: number | null;
  readonly goodWhen: Goodness;
}

function StatCard({
  label,
  value,
  badge,
  trending,
  headline,
  detail,
}: {
  label: string;
  value: string;
  badge?: React.ReactNode;
  trending?: Trending;
  headline: string;
  detail: string;
}) {
  const change = trending?.change ?? null;
  const TrendIcon = change === null ? null : change === 0 ? Minus : change < 0 ? TrendingDown : TrendingUp;
  const cardBadge = badge ?? (trending && change !== null ? <ChangeBadge change={change} goodWhen={trending.goodWhen} /> : null);
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
        {cardBadge ? <CardAction>{cardBadge}</CardAction> : null}
      </CardHeader>
      <CardFooter className="flex-col items-start gap-1.5 text-sm">
        <div className="line-clamp-1 flex gap-2 font-medium">
          {headline}
          {TrendIcon ? <TrendIcon className="size-4" /> : null}
        </div>
        <div className="text-muted-foreground">{detail}</div>
      </CardFooter>
    </Card>
  );
}

function SectionCards({ admins, stats, trend }: { admins: number; stats: Stats; trend: Trend }) {
  const current = trend.at(-1);
  const previous = trend.at(-2);
  const paidShare = stats.totalShops > 0 ? Math.round((stats.paidShops / stats.totalShops) * 100) : 0;
  const mrr =
    stats.mrrByCurrency.length === 0
      ? formatMoney(LOCALE, NO_REVENUE)
      : stats.mrrByCurrency.map((m) => formatMoney(LOCALE, m)).join(" + ");

  return (
    <div className={CARDS_GRID}>
      <StatCard
        label="Installed shops"
        value={String(stats.totalShops)}
        trending={current ? { change: percentChange(previous?.active, current.active), goodWhen: "up" } : undefined}
        headline={
          current
            ? `${formatNumber(LOCALE, current.installs)} installed, ${formatNumber(LOCALE, current.uninstalls)} left in ${current.month}`
            : "No monthly data yet"
        }
        detail="Shops with the app currently installed"
      />
      <StatCard
        label="Paid shops"
        value={String(stats.paidShops)}
        badge={<Badge variant="outline">{`${paidShare}% of shops`}</Badge>}
        headline={`${formatNumber(LOCALE, stats.freeShops)} shops on a free plan`}
        detail="Merchants with an active paid subscription"
      />
      <StatCard
        label="Monthly recurring revenue"
        value={mrr}
        headline={`From ${formatNumber(LOCALE, stats.paidShops)} paid ${stats.paidShops === 1 ? "shop" : "shops"}`}
        detail="Recurring revenue at current plan prices"
      />
      <StatCard
        label="Uninstalls this month"
        value={String(current?.uninstalls ?? 0)}
        trending={current ? { change: percentChange(previous?.uninstalls, current.uninstalls), goodWhen: "down" } : undefined}
        headline={previous ? `${formatNumber(LOCALE, previous.uninstalls)} in ${previous.month}` : "No earlier month to compare"}
        detail={`${formatNumber(LOCALE, admins)} ${admins === 1 ? "admin account" : "admin accounts"} on this console`}
      />
    </div>
  );
}

function PlansCard({ stats }: { stats: Stats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plans</CardTitle>
        <CardDescription>Where installed shops sit today</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {PLAN_LIST.map((plan) => {
          const count = stats.shopsByPlan?.[plan.handle] ?? 0;
          const cleanName = plan.name.replace(/^TODO:/i, "");
          const title = cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase();
          const pct = stats.totalShops > 0 ? Math.round((count / stats.totalShops) * 100) : 0;
          return (
            <div key={plan.handle} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{`${title} plan`}</span>
                <span className="text-muted-foreground tabular-nums">{`${formatNumber(LOCALE, count)} · ${pct}%`}</span>
              </div>
              <Progress value={pct} aria-label={`${title} plan share`} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

type ChartsPanelProps = {
  trend: React.ComponentProps<typeof DashboardCharts>["trend"];
  feedback: React.ComponentProps<typeof DashboardCharts>["uninstallFeedback"];
};

function ChartsPanel({ trend, feedback }: ChartsPanelProps) {
  const showCharts = useMountedCharts();
  if (!showCharts) return <ChartsSkeleton />;
  return (
    <Suspense fallback={<ChartsSkeleton />}>
      <DashboardCharts trend={trend} uninstallFeedback={feedback} />
    </Suspense>
  );
}

/** Never changes, so the subscribe callback is a stable no-op. */
const neverChanges = () => () => {};

/**
 * False while rendering on the server and while hydrating, true once mounted.
 *
 * Deliberately NOT just `<Suspense>`: React resolves a lazy component during
 * SSR too, which would put recharts back in the server render and back on the
 * critical path for hydration. Gating keeps the chunk request in the browser,
 * after paint.
 *
 * `useSyncExternalStore` rather than a `useState` + `useEffect` mount flag:
 * it is the API that exists precisely to give the server and the client
 * different snapshots of the same value, so hydration cannot mismatch — and
 * writing state from inside an effect is a lint error here for good reason.
 */
function useMountedCharts(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true, // client
    () => false, // server, and the hydrating pass
  );
}
