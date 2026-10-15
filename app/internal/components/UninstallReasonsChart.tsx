import { Badge } from "~/internal/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/internal/components/ui/chart";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/internal/components/ui/empty";
import { Cell, Pie, PieChart } from "recharts";
import { Inbox } from "lucide-react";
import {
  aggregateUninstallReasons,
  type RawUninstallFeedback,
} from "~/domain/uninstall-feedback";

/** Primary ink stepped down in strength: distinguishable slices without leaving the neutral palette. */
const PIE_COLORS = [100, 78, 58, 42, 30, 20, 12].map(
  (strength) => `color-mix(in oklab, var(--primary) ${strength}%, transparent)`,
);

type Reason = ReturnType<typeof aggregateUninstallReasons>[number];

/** Pie/Donut chart breaking down merchant uninstall reasons. */
export function UninstallReasonsChart({
  feedback,
}: {
  feedback: readonly RawUninstallFeedback[];
}) {
  const reasons = aggregateUninstallReasons(feedback);
  const total = reasons.reduce((sum, r) => sum + r.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uninstall reasons</CardTitle>
        <CardDescription>{total > 0 ? `${total} responses categorized` : "Exit survey breakdown"}</CardDescription>
        <CardAction>
          <Badge variant="outline">{String(total)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-64 flex-col items-center justify-center">
        {reasons.length === 0 ? <NoReasons /> : <ReasonsBreakdown reasons={reasons} />}
      </CardContent>
    </Card>
  );
}

function NoReasons() {
  return (
    <Empty className="p-4 md:p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox />
        </EmptyMedia>
        <EmptyTitle>No uninstall reasons recorded</EmptyTitle>
        <EmptyDescription>
          No merchants have submitted an exit survey reason yet.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ReasonsBreakdown({ reasons }: { reasons: readonly Reason[] }) {
  return (
    <div className="flex w-full flex-col gap-6 sm:flex-row sm:items-center">
      <ReasonsPie reasons={reasons} />
      <div className="flex flex-1 flex-col gap-2">
        {reasons.map((r, idx) => (
          <div key={r.reason} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
              />
              <span className="font-medium text-foreground">{r.label}</span>
            </div>
            <span className="text-muted-foreground tabular-nums">
              {r.count} ({r.percentage}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReasonsPie({ reasons }: { reasons: readonly Reason[] }) {
  const pieConfig = Object.fromEntries(
    reasons.map((r, i) => [
      r.reason,
      { label: r.label, color: PIE_COLORS[i % PIE_COLORS.length] },
    ]),
  ) satisfies ChartConfig;

  return (
    <ChartContainer config={pieConfig} className="mx-auto h-52 w-52 shrink-0">
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(val, name) =>
                `${val} (${reasons.find((r) => r.label === name || r.reason === name)?.percentage ?? 0}%)`
              }
            />
          }
        />
        <Pie
          data={[...reasons]}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={48}
          outerRadius={76}
          paddingAngle={3}
        >
          {reasons.map((entry, index) => (
            <Cell
              key={`cell-${entry.reason}`}
              fill={PIE_COLORS[index % PIE_COLORS.length]}
            />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
