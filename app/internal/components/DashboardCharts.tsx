import { useState } from "react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/internal/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/internal/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "~/internal/components/ui/toggle-group";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { MerchantMonth } from "~/domain/merchant-trend";
import type { RawUninstallFeedback } from "~/domain/uninstall-feedback";
import { formatNumber } from "~/i18n/format";
import { UninstallFeedbackList } from "./UninstallFeedbackList";
import { UninstallReasonsChart } from "./UninstallReasonsChart";
import type { Locale } from "~/i18n/config";

/**
 * Every chart on the dashboard, in ONE module with a default export, so
 * `lazy(() => import(...))` pulls recharts into a chunk of its own.
 *
 * Recharts is by far the heaviest thing the console renders, and none of it is
 * needed to paint the page: the stat cards above carry the numbers a staff
 * member usually opens this page for. Splitting it here is what lets the
 * dashboard render immediately and fill the charts in a moment later — see the
 * client-only mount in routes/internal/dashboard.tsx.
 *
 * The internal console is staff-only and English-only, so no i18n.
 */
const LOCALE: Locale = "en";

/** Neutral-theme chart colours (dashboard-01): the primary ink and one lighter step, legible in both themes. */
const GROWTH_CONFIG = {
  active: { label: "Installed shops", color: "var(--primary)" },
} satisfies ChartConfig;

const MOVEMENT_CONFIG = {
  installs: { label: "Installs", color: "var(--primary)" },
  uninstalls: { label: "Uninstalls", color: "var(--chart-2)" },
} satisfies ChartConfig;

const RANGES = [
  { value: "12", months: 12, label: "Last 12 months" },
  { value: "6", months: 6, label: "Last 6 months" },
  { value: "3", months: 3, label: "Last 3 months" },
] as const;

type RangeValue = (typeof RANGES)[number]["value"];

export default function DashboardCharts({
  trend,
  uninstallFeedback = [],
}: {
  trend: readonly MerchantMonth[];
  uninstallFeedback?: readonly RawUninstallFeedback[];
}) {
  return (
    <>
      <GrowthChart trend={trend} />
      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <MovementChart trend={trend} />
        <UninstallReasonsChart feedback={uninstallFeedback} />
      </div>
      <UninstallFeedbackList feedback={uninstallFeedback} />
    </>
  );
}

function isRangeValue(value: string): value is RangeValue {
  return RANGES.some((range) => range.value === value);
}

/** The months to draw: the last N of the loaded trend, however many that is. */
function windowOf(trend: readonly MerchantMonth[], range: RangeValue): MerchantMonth[] {
  const months = RANGES.find((candidate) => candidate.value === range)?.months ?? trend.length;
  return trend.slice(-months);
}

/** Range picker: a toggle group where there is room, a select where there is not (dashboard-01). */
function RangePicker({ range, onChange }: { range: RangeValue; onChange: (value: RangeValue) => void }) {
  const change = (value: string) => {
    if (isRangeValue(value)) onChange(value);
  };
  return (
    <CardAction>
      <ToggleGroup
        type="single"
        value={range}
        onValueChange={change}
        variant="outline"
        className="hidden @[767px]/card:flex"
      >
        {RANGES.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="px-4">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Select value={range} onValueChange={change}>
        <SelectTrigger size="sm" className="w-40 @[767px]/card:hidden" aria-label="Choose a time range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGES.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </CardAction>
  );
}

/** Shops with the app still installed at the end of each month. */
function GrowthChart({ trend }: { trend: readonly MerchantMonth[] }) {
  const [range, setRange] = useState<RangeValue>("12");
  const data = windowOf(trend, range);
  const current = data.at(-1)?.active ?? 0;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Merchant growth</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            {`${formatNumber(LOCALE, current)} ${current === 1 ? "shop" : "shops"} with the app installed at the end of the last month`}
          </span>
          <span className="@[540px]/card:hidden">Installed shops</span>
        </CardDescription>
        <RangePicker range={range} onChange={setRange} />
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={GROWTH_CONFIG} className="aspect-auto h-64 w-full">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-active)" stopOpacity={1.0} />
                <stop offset="95%" stopColor="var(--color-active)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Area dataKey="active" type="natural" fill="url(#growth-fill)" stroke="var(--color-active)" />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/** Installs against uninstalls, month by month: the two forces behind the growth line. */
function MovementChart({ trend }: { trend: readonly MerchantMonth[] }) {
  const installs = trend.reduce((total, month) => total + month.installs, 0);
  const uninstalls = trend.reduce((total, month) => total + month.uninstalls, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Installs and uninstalls</CardTitle>
        <CardDescription>
          {`${formatNumber(LOCALE, installs)} installed, ${formatNumber(LOCALE, uninstalls)} left over ${trend.length} ${trend.length === 1 ? "month" : "months"}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={MOVEMENT_CONFIG} className="aspect-auto h-64 w-full">
          <BarChart data={[...trend]}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="installs" fill="var(--color-installs)" radius={4} />
            <Bar dataKey="uninstalls" fill="var(--color-uninstalls)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
