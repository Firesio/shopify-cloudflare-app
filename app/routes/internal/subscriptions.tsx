import { shopifyEvents, adminSessionUsers } from "~/wiring.server";
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Subscriptions · Staff Console" },
];
import { Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Receipt } from "lucide-react";
import { Badge } from "~/internal/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/internal/components/ui/empty";
import { DataTable, SortableHeader } from "~/internal/components/data-table";
import { requireAdminUser } from "~/services/admin-auth.server";
import { Deferred, TableSkeleton } from "~/internal/components";
import { streamRegion } from "~/internal/stream-region.server";
import { planForShopifyHandle } from "~/billing/plans";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { Locale } from "~/i18n/config";
import type { SubscriptionStatus } from "~/domain/subscription-lifecycle";

/** The internal console is staff-only and English-only — no i18n here. */
const LOCALE: Locale = "en";

/** How many rows of history to show before this needs its own pagination. */
const RECENT_LIMIT = 200;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await requireAdminUser(request, { users: adminSessionUsers() });
  return {
    events: streamRegion("subscriptions", "events", shopifyEvents().listRecentSubscriptionEvents(RECENT_LIMIT)),
  };
};

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

type SubscriptionEvent = Awaited<Awaited<ReturnType<typeof loader>>["events"]>[number];

function planLabel(event: SubscriptionEvent): string {
  return planForShopifyHandle(event.planHandle)?.name ?? event.planHandle ?? "Free";
}

const COLUMNS: ColumnDef<SubscriptionEvent>[] = [
  {
    id: "shop",
    accessorFn: (event) => event.shop,
    header: ({ column }) => <SortableHeader column={column} title="Shop" />,
    cell: ({ row }) => (
      <Link
        to={`/internal/shops/${encodeURIComponent(row.original.shop)}`}
        prefetch="intent"
        className="font-medium hover:underline"
      >
        {row.original.shop}
      </Link>
    ),
    enableHiding: false,
  },
  {
    id: "plan",
    accessorFn: planLabel,
    header: ({ column }) => <SortableHeader column={column} title="Plan" />,
    cell: ({ row }) => planLabel(row.original),
  },
  {
    id: "status",
    accessorFn: (event) => STATUS_LABEL[event.status],
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={STATUS_BADGE[row.original.status].variant} className={STATUS_BADGE[row.original.status].className}>
        {STATUS_LABEL[row.original.status]}
      </Badge>
    ),
  },
  {
    id: "changed",
    accessorFn: (event) => event.occurredAt,
    header: ({ column }) => (
      <div className="flex justify-end">
        <SortableHeader column={column} title="Changed" />
      </div>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {formatDateTime(LOCALE, row.original.occurredAt, UTC)}
      </div>
    ),
    // Newest first, the order a history is read in.
    sortDescFirst: true,
  },
];

function NoSubscriptionActivity() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Receipt />
        </EmptyMedia>
        <EmptyTitle>No subscription activity yet</EmptyTitle>
        <EmptyDescription>It shows up after Partner history records subscription activity.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export default function Subscriptions() {
  const { events } = useLoaderData<typeof loader>();

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <Deferred
        resolve={events}
        fallback={<TableSkeleton rows={10} columns={4} inset />}
        errorTitle="Subscription history"
        insetError
      >
        {(resolved) => (
          <DataTable
            columns={COLUMNS}
            data={resolved}
            getRowId={(event) => event.id}
            compactHidden={["plan"]}
            rowHref={(event) => `/internal/shops/${encodeURIComponent(event.shop)}`}
            search={{ placeholder: "Search shops or plans…", text: (event) => `${event.shop} ${planLabel(event)}` }}
            toolbarStart={
              <p className="truncate text-sm text-muted-foreground">
                Every plan change Shopify has told this app about, across every shop.
              </p>
            }
            empty={<NoSubscriptionActivity />}
          />
        )}
      </Deferred>
    </div>
  );
}
