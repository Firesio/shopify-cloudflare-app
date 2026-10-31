import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MessageSquare, Store } from "lucide-react";
import { Link } from "react-router";
import { Avatar, AvatarFallback, AvatarImage } from "~/internal/components/ui/avatar";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/internal/components/ui/dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "~/internal/components/ui/empty";
import { DataTable, SortableHeader } from "~/internal/components/data-table";
import {
  filterMerchantFeedback,
  formatReason,
  type RawUninstallFeedback,
} from "~/domain/uninstall-feedback";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { LanguageCode } from "~/i18n/catalogues.generated";

const LANGUAGE: LanguageCode = "en";

/** Messages longer than this are clamped in the table and open in a dialog. */
const LONG_MESSAGE = 80;

function shopLabel(item: RawUninstallFeedback): string {
  return item.shopName ? `${item.shopName} (${item.shop})` : item.shop;
}

function feedbackColumns(onOpen: (item: RawUninstallFeedback) => void): ColumnDef<RawUninstallFeedback>[] {
  return [
    {
      id: "shop",
      accessorFn: shopLabel,
      header: ({ column }) => <SortableHeader column={column} title="Shop" />,
      cell: ({ row }) => <ShopCell item={row.original} />,
      enableHiding: false,
    },
    {
      id: "reason",
      accessorFn: (item) => (item.reason ? formatReason(item.reason) : ""),
      header: "Reason",
      cell: ({ row }) =>
        row.original.reason ? (
          <Badge variant="outline" className="text-xs">
            {formatReason(row.original.reason)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "feedback",
      accessorFn: (item) => item.reasonDescription ?? "",
      header: "Feedback",
      cell: ({ row }) => <MessageCell item={row.original} onOpen={onOpen} />,
      enableSorting: false,
    },
    {
      id: "date",
      accessorFn: (item) => item.occurredAt,
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column} title="Date" />
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {formatDateTime(LANGUAGE, row.original.occurredAt, UTC)}
        </div>
      ),
      sortDescFirst: true,
    },
  ];
}

/** List of written feedback comments left by departing merchants. */
export function UninstallFeedbackList({
  feedback,
}: {
  feedback: readonly RawUninstallFeedback[];
}) {
  const [activeItem, setActiveItem] = useState<RawUninstallFeedback | null>(null);
  const itemsWithText = useMemo(() => filterMerchantFeedback(feedback), [feedback]);
  const columns = useMemo(() => feedbackColumns(setActiveItem), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Merchant exit comments</CardTitle>
        <CardDescription>{"Written feedback submitted by merchants upon uninstalling"}</CardDescription>
        <CardAction>
          <Badge variant="outline">{String(itemsWithText.length)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <DataTable
          columns={columns}
          data={itemsWithText}
          getRowId={(item) => item.eventId}
          compactHidden={["reason"]}
          search={{
            placeholder: "Search feedback…",
            text: (item) => `${item.shopName ?? ""} ${item.shop} ${item.reason ?? ""} ${item.reasonDescription ?? ""}`,
          }}
          empty={<NoFeedback />}
        />
      </CardContent>
      <FeedbackDialog item={activeItem} onClose={() => setActiveItem(null)} />
    </Card>
  );
}

function NoFeedback() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageSquare />
        </EmptyMedia>
        <EmptyTitle>No merchant exit feedback submitted yet.</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

function ShopCell({ item }: { item: RawUninstallFeedback }) {
  return (
    <div className="flex items-center gap-3 font-medium">
      <Avatar className="size-6 rounded-md border">
        {item.logoUrl ? <AvatarImage src={item.logoUrl} alt="" className="object-contain p-0.5" /> : null}
        <AvatarFallback className="rounded-md">
          <Store className="size-3.5 text-muted-foreground" />
        </AvatarFallback>
      </Avatar>
      <Link
        to={`/internal/shops/${encodeURIComponent(item.shop)}`}
        prefetch="intent"
        className="hover:underline"
      >
        {shopLabel(item)}
      </Link>
    </div>
  );
}

function MessageCell({
  item,
  onOpen,
}: {
  item: RawUninstallFeedback;
  onOpen: (item: RawUninstallFeedback) => void;
}) {
  return (
    <div className="flex max-w-md min-w-48 flex-col gap-1.5 whitespace-normal">
      <p className="line-clamp-3 text-sm italic text-foreground [overflow-wrap:anywhere]">
        "{item.reasonDescription}"
      </p>
      {(item.reasonDescription?.length ?? 0) > LONG_MESSAGE && (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="self-start px-0"
          onClick={() => onOpen(item)}
        >
          View full message
        </Button>
      )}
    </div>
  );
}

function FeedbackDialog({
  item,
  onClose,
}: {
  item: RawUninstallFeedback | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merchant exit feedback</DialogTitle>
          {item && (
            <DialogDescription>
              {shopLabel(item)} · {formatDateTime(LANGUAGE, item.occurredAt, UTC)}
            </DialogDescription>
          )}
        </DialogHeader>
        {item && (
          <div className="flex flex-col gap-4 py-2">
            {item.reason && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Reason:</span>
                <Badge variant="outline">{formatReason(item.reason)}</Badge>
              </div>
            )}
            <div className="max-h-72 overflow-y-auto rounded-md bg-muted/40 p-4 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere] whitespace-pre-wrap italic">
              "{item.reasonDescription}"
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
