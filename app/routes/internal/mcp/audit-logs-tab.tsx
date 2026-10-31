import type { ColumnDef } from "@tanstack/react-table";
import { ScrollText } from "lucide-react";
import { Badge } from "~/internal/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/internal/components/ui/empty";
import { DataTable, SortableHeader } from "~/internal/components/data-table";
import type { listRecentAuditLogs } from "~/services/mcp/audit.server";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { LanguageCode } from "~/i18n/catalogues.generated";
import { RightAlignedSortableHeader } from "../table-columns";

const LANGUAGE: LanguageCode = "en";

type AuditLog = Awaited<ReturnType<typeof listRecentAuditLogs>>[number];

function actorKind(log: AuditLog): string {
  return log.actorType === "oauth_agent" ? "OAuth agent" : "Personal token";
}

const COLUMNS: ColumnDef<AuditLog>[] = [
  {
    id: "when",
    accessorFn: (log) => log.createdAt,
    header: ({ column }) => <SortableHeader column={column} title="When" />,
    enableHiding: false,
    cell: ({ row }) => (
      <span className="text-xs whitespace-nowrap tabular-nums text-muted-foreground">
        {formatDateTime(LANGUAGE, row.original.createdAt, UTC)}
      </span>
    ),
  },
  {
    id: "actor",
    accessorFn: (log) => log.actorEmail,
    header: ({ column }) => <SortableHeader column={column} title="Actor" />,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-xs font-medium">{row.original.actorEmail}</span>
        <span className="text-xs text-muted-foreground">{actorKind(row.original)}</span>
      </div>
    ),
  },
  {
    id: "tool",
    accessorFn: (log) => log.toolName,
    header: ({ column }) => <SortableHeader column={column} title="Tool / endpoint" />,
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.toolName}</span>,
  },
  {
    id: "shop",
    accessorFn: (log) => log.shop ?? "",
    header: ({ column }) => <SortableHeader column={column} title="Shop" />,
    cell: ({ row }) => <span className="text-xs">{row.original.shop ?? "—"}</span>,
  },
  {
    id: "type",
    accessorFn: (log) => (log.isMutation ? "Mutation" : "Query"),
    header: "Type",
    cell: ({ row }) => (
      <Badge variant={row.original.isMutation ? "secondary" : "outline"}>
        {row.original.isMutation ? "Mutation" : "Query"}
      </Badge>
    ),
  },
  {
    id: "status",
    accessorFn: (log) => (log.ok ? "200 OK" : "Error"),
    header: ({ column }) => <SortableHeader column={column} title="Status" />,
    cell: ({ row }) =>
      row.original.ok ? (
        <Badge variant="outline">200 OK</Badge>
      ) : (
        <Badge variant="destructive" title={row.original.errorMessage ?? undefined}>
          Error
        </Badge>
      ),
  },
  {
    id: "latency",
    accessorFn: (log) => log.latencyMs,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Latency" />,
    cell: ({ row }) => (
      <div className="text-right font-mono text-xs tabular-nums text-muted-foreground">
        {row.original.latencyMs}ms
      </div>
    ),
  },
];

export function AuditLogsTab({ logs }: { logs: AuditLog[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={logs}
      getRowId={(log) => log.id}
      compactHidden={["shop", "type", "latency"]}
      toolbarStart={
        <div className="flex min-w-0 flex-col">
          <h3 className="text-base font-semibold">Audit &amp; activity stream</h3>
          <p className="text-sm text-muted-foreground">
            Log of tool calls, mutations, shop lookups, and replies made through MCP and REST APIs.
          </p>
        </div>
      }
      empty={
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollText />
            </EmptyMedia>
            <EmptyTitle>No activity logged yet</EmptyTitle>
            <EmptyDescription>Call any MCP tool or API endpoint to start tracking.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  );
}
