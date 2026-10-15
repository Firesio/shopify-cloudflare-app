import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { LifeBuoy } from "lucide-react";
import { Badge } from "~/internal/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/internal/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/internal/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "~/internal/components/ui/tabs";
import { DataTable, SortableHeader } from "~/internal/components/data-table";
import type { SupportStatus } from "~/support/status";
import { CATEGORY_LABEL_EN, type SupportCategory } from "~/support/categories";
import { formatDateTime, formatNumber } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { Locale } from "~/i18n/config";
import { RightAlignedSortableHeader } from "../table-columns";
import { STATUS_LABEL, STATUS_VARIANT } from "./status-display";

/** The internal console is staff-only and English-only — no i18n here. */
const LOCALE: Locale = "en";

export interface TicketRowData {
  readonly id: string;
  readonly shop: string;
  readonly shopName: string;
  readonly subject: string;
  readonly category: SupportCategory;
  readonly status: SupportStatus;
  readonly lastMessageAt: number;
  readonly planName: string;
  readonly unread: boolean;
}

const VIEWS = ["all", "open", "answered"] as const;
type View = (typeof VIEWS)[number];

function isView(value: string): value is View {
  return VIEWS.some((view) => view === value);
}

/** Which tickets a view shows. "all" is every open thread, whoever's turn it is. */
function inView(view: View, ticket: TicketRowData): boolean {
  return view === "all" || ticket.status === view;
}

const COLUMNS: ColumnDef<TicketRowData>[] = [
  {
    id: "subject",
    accessorFn: (ticket) => ticket.subject,
    header: ({ column }) => <SortableHeader column={column} title="Subject" />,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <Link
          to={`/internal/support/${row.original.id}`}
          prefetch="intent"
          className="font-medium underline-offset-4 hover:underline"
        >
          {row.original.subject}
        </Link>
        {row.original.unread && <Badge variant="default">New</Badge>}
      </div>
    ),
  },
  {
    id: "shop",
    accessorFn: (ticket) => ticket.shopName || ticket.shop,
    header: ({ column }) => <SortableHeader column={column} title="Shop" />,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.shopName || row.original.shop}</span>,
  },
  {
    id: "plan",
    accessorFn: (ticket) => ticket.planName,
    header: ({ column }) => <SortableHeader column={column} title="Plan" />,
    cell: ({ row }) => <Badge variant="outline">{row.original.planName}</Badge>,
  },
  {
    id: "type",
    accessorFn: (ticket) => CATEGORY_LABEL_EN[ticket.category],
    header: "Type",
    cell: ({ row }) => <span className="text-muted-foreground">{CATEGORY_LABEL_EN[row.original.category]}</span>,
  },
  {
    id: "status",
    accessorFn: (ticket) => STATUS_LABEL[ticket.status],
    header: ({ column }) => <SortableHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status]}>{STATUS_LABEL[row.original.status]}</Badge>
    ),
  },
  {
    id: "last activity",
    accessorFn: (ticket) => ticket.lastMessageAt,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Last activity" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-muted-foreground">
        {formatDateTime(LOCALE, row.original.lastMessageAt, UTC)}
      </div>
    ),
  },
];

function NoTickets() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LifeBuoy />
        </EmptyMedia>
        <EmptyTitle>No open tickets</EmptyTitle>
        <EmptyDescription>When a merchant files a ticket from their admin, it lands here.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

const VIEW_LABEL: Record<View, string> = {
  all: "All",
  open: "Needs reply",
  answered: "Waiting on merchant",
};

function ViewTab({ view, label, count }: { view: View; label: string; count: number }) {
  return (
    <TabsTrigger value={view}>
      {label}
      <Badge variant="secondary" className="rounded-full px-1.5">
        {formatNumber(LOCALE, count)}
      </Badge>
    </TabsTrigger>
  );
}

export function TicketTable({
  tickets,
  toolbarEnd,
}: {
  readonly tickets: readonly TicketRowData[];
  readonly toolbarEnd: ReactNode;
}) {
  const [view, setView] = useState<View>("all");
  const changeView = (value: string) => {
    if (isView(value)) setView(value);
  };
  const visible = useMemo(() => tickets.filter((ticket) => inView(view, ticket)), [tickets, view]);
  const count = (target: View) => tickets.filter((ticket) => inView(target, ticket)).length;

  return (
    <DataTable
      columns={COLUMNS}
      data={visible}
      getRowId={(ticket) => ticket.id}
      compactHidden={["plan", "type", "shop"]}
      rowHref={(ticket) => `/internal/support/${ticket.id}`}
      search={{
        placeholder: "Search tickets…",
        text: (ticket) => `${ticket.subject} ${ticket.shopName} ${ticket.shop}`,
      }}
      toolbarStart={
        <>
          {/* dashboard-01: a select where the page is narrow, tabs with counts where there is room. */}
          <Select value={view} onValueChange={changeView}>
            <SelectTrigger size="sm" className="w-fit @4xl/main:hidden" aria-label="View">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIEWS.map((option) => (
                <SelectItem key={option} value={option}>
                  {`${VIEW_LABEL[option]} (${formatNumber(LOCALE, count(option))})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs value={view} onValueChange={changeView} className="hidden @4xl/main:flex">
            <TabsList>
              {VIEWS.map((option) => (
                <ViewTab key={option} view={option} label={VIEW_LABEL[option]} count={count(option)} />
              ))}
            </TabsList>
          </Tabs>
        </>
      }
      toolbarEnd={toolbarEnd}
      empty={tickets.length === 0 ? <NoTickets /> : "No tickets in this view."}
    />
  );
}
