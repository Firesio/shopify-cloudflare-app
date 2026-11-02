import { useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "~/internal/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "~/internal/components/ui/tabs";
import { DataTable, SortableHeader } from "~/internal/components/data-table";
import type { RecipientCounts } from "~/domain/campaign-delivery";
import { formatDateTime, formatNumber } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { CampaignRecipient, RecipientStatus } from "~/ports/campaigns";
import { RightAlignedSortableHeader } from "../table-columns";
import { RECIPIENT_LABEL, RECIPIENT_STATUSES, toRecipientStatus, totalOf } from "./display";

const STATUS_BADGE: Readonly<Record<RecipientStatus, "default" | "secondary" | "outline" | "destructive">> = {
  pending: "outline",
  sent: "secondary",
  failed: "destructive",
  refused: "destructive",
  skipped: "outline",
};

const COLUMNS: ColumnDef<CampaignRecipient>[] = [
  {
    id: "shop",
    accessorFn: (recipient) => recipient.shopName,
    header: ({ column }) => <SortableHeader column={column} title="Shop" />,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">{row.original.shopName}</span>
        <span className="text-xs text-muted-foreground">{row.original.shop}</span>
      </div>
    ),
  },
  {
    id: "email",
    accessorFn: (recipient) => recipient.email,
    header: ({ column }) => <SortableHeader column={column} title="Email" />,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
  },
  {
    id: "status",
    accessorFn: (recipient) => RECIPIENT_LABEL[recipient.status],
    header: "Status",
    cell: ({ row }) => <Badge variant={STATUS_BADGE[row.original.status]}>{RECIPIENT_LABEL[row.original.status]}</Badge>,
  },
  {
    id: "reason",
    accessorFn: (recipient) => recipient.reasonCode ?? "",
    header: "Reason",
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.reasonCode ?? "—"}</span>,
  },
  {
    id: "attempts",
    accessorFn: (recipient) => recipient.attempts,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Attempts" />,
    cell: ({ row }) => <div className="text-right tabular-nums text-muted-foreground">{row.original.attempts}</div>,
  },
  {
    id: "settled",
    accessorFn: (recipient) => recipient.settledAt ?? 0,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Settled" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-muted-foreground">{row.original.settledAt === null ? "—" : formatDateTime("en", row.original.settledAt, UTC)}</div>
    ),
  },
];

/** The filter lives in the URL (`?status=failed`), so the server reads only that status and a link can be shared. */
function StatusTabs({ counts, current }: { readonly counts: RecipientCounts; readonly current: RecipientStatus | null }) {
  const [, setSearchParams] = useSearchParams();
  const change = (value: string) => {
    const status = toRecipientStatus(value);
    setSearchParams(status === null ? {} : { status }, { preventScrollReset: true });
  };
  return (
    <Tabs value={current ?? "all"} onValueChange={change}>
      <TabsList>
        <TabsTrigger value="all">
          All
          <Badge variant="secondary" className="rounded-full px-1.5">{formatNumber("en", totalOf(counts))}</Badge>
        </TabsTrigger>
        {RECIPIENT_STATUSES.map((status) => (
          <TabsTrigger key={status} value={status}>
            {RECIPIENT_LABEL[status]}
            <Badge variant="secondary" className="rounded-full px-1.5">{formatNumber("en", counts[status])}</Badge>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function RecipientsTable({
  recipients,
  counts,
  status,
  limit,
}: {
  readonly recipients: readonly CampaignRecipient[];
  readonly counts: RecipientCounts;
  readonly status: RecipientStatus | null;
  readonly limit: number;
}) {
  return (
    <section aria-label="Recipients" className="flex flex-col gap-2">
      <h2 className="px-4 text-lg font-semibold tracking-tight lg:px-6">Recipients</h2>
      <DataTable
        columns={COLUMNS}
        data={recipients}
        getRowId={(recipient) => recipient.shop}
        columnMenu={false}
        compactHidden={["reason", "attempts", "settled"]}
        search={{ placeholder: "Search shops or emails…", text: (recipient) => `${recipient.shopName} ${recipient.shop} ${recipient.email}` }}
        toolbarStart={<StatusTabs counts={counts} current={status} />}
        empty="Nobody with this status."
      />
      {recipients.length >= limit && (
        <p className="px-4 text-sm text-muted-foreground lg:px-6">{`Showing the first ${limit}${status === null ? "" : ` ${RECIPIENT_LABEL[status].toLowerCase()}`} recipients.`}</p>
      )}
    </section>
  );
}
