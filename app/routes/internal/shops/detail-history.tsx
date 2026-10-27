import { Badge } from "~/internal/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/internal/components/ui/table";
import { planForShopifyHandle } from "~/billing/plans";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { LanguageCode } from "~/i18n/catalogues.generated";
import type { SubscriptionStatus } from "~/domain/subscription-lifecycle";
import type { EventHistoryRow } from "./detail-events";

/** The internal console is staff-only and English-only — no i18n here. */
const LANGUAGE: LanguageCode = "en";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  ACTIVE: "Active",
  CANCELLATION_SCHEDULED: "Cancellation scheduled",
  CANCELED: "Canceled",
  NONE: "Free",
  UNKNOWN: "Unknown",
  PENDING: "Pending",
  FROZEN: "Frozen",
};

const SUCCESS_TINT = "border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
const WARNING_TINT = "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";

/** shadcn's Badge has no success/warning variants, so those two are outline badges with a tint. */
const STATUS_BADGE: Record<SubscriptionStatus, { variant: "outline" | "destructive"; className?: string }> = {
  ACTIVE: { variant: "outline", className: SUCCESS_TINT },
  CANCELLATION_SCHEDULED: { variant: "outline", className: WARNING_TINT },
  CANCELED: { variant: "destructive" },
  NONE: { variant: "outline" },
  UNKNOWN: { variant: "outline" },
  PENDING: { variant: "outline", className: WARNING_TINT },
  FROZEN: { variant: "outline", className: WARNING_TINT },
};

function EventRow({ event }: { event: EventHistoryRow }) {
  return (
    <TableRow>
      <TableCell className="pl-4 font-medium">{event.kind}</TableCell>
      <TableCell>
        <Badge variant="outline">{event.status}</Badge>
      </TableCell>
      <TableCell className="max-w-md whitespace-normal text-muted-foreground">{event.detail}</TableCell>
      <TableCell className="pr-4 text-right text-muted-foreground tabular-nums">
        {formatDateTime(LANGUAGE, event.occurredAt, UTC)}
      </TableCell>
    </TableRow>
  );
}

export function EventHistorySection({ events }: { events: readonly EventHistoryRow[] }) {
  return (
    <Card role="region" aria-labelledby="event-history-heading">
      <CardHeader>
        <CardTitle id="event-history-heading">Event history</CardTitle>
        <CardDescription>Immutable relationship, subscription, and webhook delivery records.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Event</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead className="pr-4 text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No event records for this shop yet.
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => <EventRow key={event.id} event={event} />)
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

interface SubscriptionHistoryItem {
  readonly id: string;
  readonly planHandle: string | null;
  readonly status: SubscriptionStatus;
  readonly occurredAt: number;
}

function SubscriptionRow({ event }: { event: SubscriptionHistoryItem }) {
  const badge = STATUS_BADGE[event.status];
  return (
    <TableRow>
      <TableCell className="pl-4 font-medium">
        {planForShopifyHandle(event.planHandle)?.name ?? event.planHandle ?? "Free"}
      </TableCell>
      <TableCell>
        <Badge variant={badge.variant} className={badge.className}>
          {STATUS_LABEL[event.status]}
        </Badge>
      </TableCell>
      <TableCell className="pr-4 text-right text-muted-foreground tabular-nums">
        {formatDateTime(LANGUAGE, event.occurredAt, UTC)}
      </TableCell>
    </TableRow>
  );
}

export function SubscriptionHistoryCard({ history }: { history: readonly SubscriptionHistoryItem[] }) {
  return (
    <Card role="region" aria-labelledby="subscription-history-heading">
      <CardHeader>
        <CardTitle id="subscription-history-heading">Subscription history</CardTitle>
        <CardDescription>Every plan change Shopify has reported for this shop.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-4 text-right">Changed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No subscription activity for this shop yet.
                </TableCell>
              </TableRow>
            ) : (
              history.map((event) => <SubscriptionRow key={event.id} event={event} />)
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
