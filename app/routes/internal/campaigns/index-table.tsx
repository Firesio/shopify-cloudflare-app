import type { ReactNode } from "react";
import { Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Megaphone, Plus } from "lucide-react";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/internal/components/ui/empty";
import { DataTable, SortableHeader } from "~/internal/components/data-table";
import { formatDateTime, formatNumber } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { CampaignSummary } from "~/ports/campaigns";
import { paths } from "~/urls";
import { RightAlignedSortableHeader } from "../table-columns";
import { NEW_CAMPAIGN_PATH, PAUSE_EXPLANATION, STATUS_LABEL, STATUS_VARIANT } from "./display";

const COLUMNS: ColumnDef<CampaignSummary>[] = [
  {
    id: "name",
    accessorFn: (campaign) => campaign.name,
    header: ({ column }) => <SortableHeader column={column} title="Name" />,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col">
        <Link to={paths.internal.campaign(row.original.id)} prefetch="intent" className="font-medium underline-offset-4 hover:underline">
          {row.original.name}
        </Link>
        <span className="truncate text-xs text-muted-foreground">{row.original.subject}</span>
      </div>
    ),
  },
  {
    id: "status",
    accessorFn: (campaign) => STATUS_LABEL[campaign.status],
    header: ({ column }) => <SortableHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <Badge variant={STATUS_VARIANT[row.original.status]}>{STATUS_LABEL[row.original.status]}</Badge>
        {row.original.pauseReason !== null && <span className="text-xs text-muted-foreground">{PAUSE_EXPLANATION[row.original.pauseReason].title}</span>}
      </div>
    ),
  },
  {
    // A draft has not fixed its recipients yet.
    id: "recipients",
    accessorFn: (campaign) => campaign.recipientCount ?? -1,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Recipients" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-muted-foreground">
        {row.original.recipientCount === null ? "Not chosen yet" : formatNumber("en", row.original.recipientCount)}
      </div>
    ),
  },
  {
    id: "created by",
    accessorFn: (campaign) => campaign.createdByEmail,
    header: ({ column }) => <SortableHeader column={column} title="Created by" />,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.createdByEmail}</span>,
  },
  {
    id: "created",
    accessorFn: (campaign) => campaign.createdAt,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Created" />,
    cell: ({ row }) => <div className="text-right tabular-nums text-muted-foreground">{formatDateTime("en", row.original.createdAt, UTC)}</div>,
  },
];

function NoCampaigns() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Megaphone />
        </EmptyMedia>
        <EmptyTitle>No campaigns yet</EmptyTitle>
        <EmptyDescription>Write an announcement, choose which merchants get it, and send it. You can test it on yourself first.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to={NEW_CAMPAIGN_PATH}>
            <Plus />
            New campaign
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function CampaignTable({
  campaigns,
  limit,
  toolbarStart,
  toolbarEnd,
}: {
  readonly campaigns: readonly CampaignSummary[];
  /** The most the list shows: when it is reached, older ones are not here. */
  readonly limit: number;
  readonly toolbarStart: ReactNode;
  readonly toolbarEnd: ReactNode;
}) {
  return (
    <>
      <DataTable
        columns={COLUMNS}
        data={campaigns}
        getRowId={(campaign) => campaign.id}
        compactHidden={["created by", "created"]}
        search={{ placeholder: "Search campaigns…", text: (campaign) => `${campaign.name} ${campaign.subject}` }}
        toolbarStart={toolbarStart}
        toolbarEnd={toolbarEnd}
        empty={<NoCampaigns />}
        rowHref={(campaign) => paths.internal.campaign(campaign.id)}
      />
      {campaigns.length >= limit && (
        <p className="px-4 text-sm text-muted-foreground lg:px-6">{`Showing the newest ${limit} campaigns.`}</p>
      )}
    </>
  );
}
