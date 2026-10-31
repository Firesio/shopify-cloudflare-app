import { CircleAlert, CircleCheck } from "lucide-react";
import { Badge } from "~/internal/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Skeleton } from "~/internal/components/ui/skeleton";
import { cn } from "~/internal/lib/utils";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { LanguageCode } from "~/i18n/catalogues.generated";

/** The internal console is staff-only and English-only — no i18n here. */
const LANGUAGE: LanguageCode = "en";

export interface DashboardHealth {
  readonly failedWebhooks: number;
  readonly deadLetterWebhooks: number;
  readonly lifecycleEvents: number;
  readonly subscriptionEvents: number;
  readonly checkpoint: { readonly lastSucceededAt: number | null } | null;
}

/** A count that should be zero: red the moment it is not, so a problem is visible at a glance. */
function HealthStat({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-semibold tabular-nums", alert && value > 0 && "text-destructive")}>{value}</div>
    </div>
  );
}

function HealthBadge({ needsAttention }: { needsAttention: boolean }) {
  return needsAttention ? (
    <Badge variant="destructive">
      <CircleAlert />
      Needs attention
    </Badge>
  ) : (
    <Badge variant="outline">
      <CircleCheck />
      Healthy
    </Badge>
  );
}

export function HealthPanel({ health }: { health: DashboardHealth }) {
  const needsAttention = health.failedWebhooks > 0 || health.deadLetterWebhooks > 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Operational health</CardTitle>
        <CardDescription>
          Last sync:{" "}
          {health.checkpoint?.lastSucceededAt
            ? formatDateTime(LANGUAGE, health.checkpoint.lastSucceededAt, UTC)
            : "Not yet completed"}
        </CardDescription>
        <CardAction>
          <HealthBadge needsAttention={needsAttention} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HealthStat label="Webhook failures" value={health.failedWebhooks} alert />
        <HealthStat label="Dead-letter webhooks" value={health.deadLetterWebhooks} alert />
        <HealthStat label="Lifecycle events" value={health.lifecycleEvents} />
        <HealthStat label="Subscription events" value={health.subscriptionEvents} />
      </CardContent>
    </Card>
  );
}

export function HealthSkeleton() {
  return (
    <Card aria-hidden>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** One chart-shaped placeholder: a title line over a block of the chart's height. */
function ChartCardSkeleton({ heightClass }: { heightClass: string }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent>
        <Skeleton className={cn("w-full", heightClass)} />
      </CardContent>
    </Card>
  );
}

/**
 * Placeholders at the rough heights of the charts they stand in for, so the
 * page does not jump when the real ones arrive. `aria-hidden` because they say
 * nothing a screen reader needs; the headings inside the charts do that.
 */
export function ChartsSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 md:gap-6">
      <ChartCardSkeleton heightClass="h-64" />
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCardSkeleton heightClass="h-48" />
        <ChartCardSkeleton heightClass="h-48" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCardSkeleton heightClass="h-48" />
        <ChartCardSkeleton heightClass="h-48" />
      </div>
      <ChartCardSkeleton heightClass="h-32" />
    </div>
  );
}

/** The dashboard-01 stat-card row, as placeholders. */
export function StatCardsSkeleton({ count }: { count: number }) {
  return (
    <div aria-hidden className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-1 h-8 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-52" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
