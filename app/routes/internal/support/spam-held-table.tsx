import { useState } from "react";
import { useNavigation, useSubmit } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, EllipsisVertical, MailCheck, ShieldCheck, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/internal/components/ui/alert-dialog";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import { DataTable, SortableHeader } from "~/internal/components/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/internal/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/internal/components/ui/empty";
import { Spinner } from "~/internal/components/ui/spinner";
import { formatDateTime } from "~/i18n/format";
import type { LanguageCode } from "~/i18n/catalogues.generated";
import { UTC } from "~/i18n/time-zone";
import type { SupportSource } from "~/support/inbound/types";
import type { SpamReason } from "~/support/triage/types";
import { RightAlignedSortableHeader } from "../table-columns";
import { REASON_LABEL } from "./spam-display";
import { SOURCE_LABEL } from "./source-display";
import type { SpamIntent } from "./spam-intents.server";

/** The internal console is staff-only and English-only — no i18n here. */
const LANGUAGE: LanguageCode = "en";

export interface HeldRowData {
  readonly id: string;
  readonly senderName: string;
  readonly senderEmail: string;
  readonly subject: string;
  readonly preview: string;
  readonly reason: SpamReason;
  readonly source: SupportSource;
  readonly receivedAt: number;
}

/** True while this mail's action is in flight, so only its row shows a spinner. */
function useIsPending(id: string): boolean {
  const { state, formData } = useNavigation();
  return state !== "idle" && formData?.get("id") === id;
}

/**
 * Row actions. Releasing and blocking are reversible (a ticket can be closed, a block lifted), so they act at once;
 * deleting destroys the mail, so it asks first.
 */
function HeldActions({ row }: { row: HeldRowData }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submit = useSubmit();
  const pending = useIsPending(row.id);

  function send(intent: SpamIntent) {
    const form = new FormData();
    form.set("intent", intent);
    form.set("id", row.id);
    void submit(form, { method: "post" });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
            aria-label={`Actions for ${row.subject}`}
            disabled={pending}
          >
            {pending ? <Spinner /> : <EllipsisVertical />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => send("release")}>
            <MailCheck />
            Not spam, open a ticket
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => send("block_sender")}>
            <Ban />
            Block {row.senderEmail}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this mail?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed for good, and the sender is not blocked. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => send("discard")}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const COLUMNS: ColumnDef<HeldRowData>[] = [
  {
    id: "subject",
    accessorFn: (mail) => mail.subject,
    header: ({ column }) => <SortableHeader column={column} title="Mail" />,
    enableHiding: false,
    cell: ({ row }) => (
      <div className="flex max-w-xl flex-col">
        <span className="truncate font-medium">{row.original.subject}</span>
        <span className="truncate text-sm text-muted-foreground">{row.original.preview}</span>
      </div>
    ),
  },
  {
    id: "from",
    accessorFn: (mail) => mail.senderEmail,
    header: ({ column }) => <SortableHeader column={column} title="From" />,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span>{row.original.senderName}</span>
        <span className="text-sm text-muted-foreground">{row.original.senderEmail}</span>
      </div>
    ),
  },
  {
    id: "why",
    accessorFn: (mail) => REASON_LABEL[mail.reason],
    header: ({ column }) => <SortableHeader column={column} title="Why" />,
    cell: ({ row }) => <Badge variant="secondary">{REASON_LABEL[row.original.reason]}</Badge>,
  },
  {
    id: "source",
    accessorFn: (mail) => SOURCE_LABEL[mail.source],
    header: "Source",
    cell: ({ row }) => <Badge variant="outline">{SOURCE_LABEL[row.original.source]}</Badge>,
  },
  {
    id: "received",
    accessorFn: (mail) => mail.receivedAt,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Received" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-muted-foreground">
        {formatDateTime(LANGUAGE, row.original.receivedAt, UTC)}
      </div>
    ),
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableHiding: false,
    cell: ({ row }) => <HeldActions row={row.original} />,
  },
];

function NothingHeld() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldCheck />
        </EmptyMedia>
        <EmptyTitle>Nothing held</EmptyTitle>
        <EmptyDescription>
          Mail that looks like spam waits here for 30 days, so a real one is never lost. It never reaches the ticket queue.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function HeldMailTable({ rows }: { readonly rows: readonly HeldRowData[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={rows}
      getRowId={(mail) => mail.id}
      compactHidden={["source", "why"]}
      columnMenu={false}
      search={{
        placeholder: "Search held mail…",
        text: (mail) => `${mail.subject} ${mail.senderName} ${mail.senderEmail} ${mail.preview}`,
      }}
      empty={<NothingHeld />}
    />
  );
}
