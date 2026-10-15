import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "~/internal/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/internal/components/ui/empty";
import { DataTable, SortableHeader } from "~/internal/components/data-table";
import { formatNumber } from "~/i18n/format";
import type { Locale } from "~/i18n/config";
import { RightAlignedSortableHeader } from "../table-columns";
import type { RecentRun } from "./purposes";

const LOCALE: Locale = "en";

const COLUMNS: ColumnDef<RecentRun>[] = [
  {
    id: "status",
    accessorFn: (run) => (run.status === "ok" ? "ok" : (run.reasonCode ?? "error")),
    header: ({ column }) => <SortableHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={row.original.status === "ok" ? "outline" : "destructive"}>
        {row.original.status === "ok" ? "ok" : (row.original.reasonCode ?? "error")}
      </Badge>
    ),
  },
  {
    id: "feature",
    accessorFn: (run) => run.feature,
    header: ({ column }) => <SortableHeader column={column} title="Feature" />,
    enableHiding: false,
    cell: ({ row }) => <span className="font-medium">{row.original.feature}</span>,
  },
  {
    id: "model",
    accessorFn: (run) => run.modelId,
    header: ({ column }) => <SortableHeader column={column} title="Model" />,
    cell: ({ row }) => (
      <span className="block max-w-64 truncate text-muted-foreground" title={row.original.modelId}>
        {row.original.modelId}
      </span>
    ),
  },
  {
    id: "tokens",
    accessorFn: (run) => run.tokens,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Tokens" />,
    cell: ({ row }) => <div className="text-right tabular-nums">{formatNumber(LOCALE, row.original.tokens)}</div>,
  },
  {
    id: "latency",
    // A call with no recorded latency sorts as the fastest rather than as NaN.
    accessorFn: (run) => run.latencyMs ?? 0,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Latency" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-muted-foreground">
        {row.original.latencyMs === null ? "—" : `${formatNumber(LOCALE, row.original.latencyMs)} ms`}
      </div>
    ),
  },
];

export function RecentCallsTable({ runs }: { runs: readonly RecentRun[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={runs}
      getRowId={(run) => run.id}
      compactHidden={["model", "latency"]}
      columnMenu={false}
      toolbarStart={
        <div className="flex flex-col">
          <h2 className="text-base font-semibold">Recent calls</h2>
          <p className="text-sm text-muted-foreground">
            Every attempt leaves a row, including the ones that failed and fell through.
          </p>
        </div>
      }
      empty={
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No calls yet</EmptyTitle>
            <EmptyDescription>Calls appear here as soon as a feature uses a model.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  );
}
