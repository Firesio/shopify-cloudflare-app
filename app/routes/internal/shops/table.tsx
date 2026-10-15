import { Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Store } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/internal/components/ui/avatar";
import { Badge } from "~/internal/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "~/internal/components/ui/empty";
import { DataTable, SortableHeader } from "~/internal/components/data-table";
import { formatDate } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { Locale } from "~/i18n/config";
import type { loader } from "./index";

/** The internal console is staff-only and English-only — no i18n here. */
const LOCALE: Locale = "en";

type ShopListItem = Awaited<Awaited<ReturnType<typeof loader>>["shops"]>[number];

function ShopIdentity({ shop }: { shop: ShopListItem }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="rounded-md border">
        <AvatarImage src={shop.logoUrl} alt="" className="object-contain p-1" />
        <AvatarFallback className="rounded-md">
          <Store className="size-4 text-muted-foreground" />
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <Link
          to={`/internal/shops/${encodeURIComponent(shop.shop)}`}
          prefetch="intent"
          className="font-medium leading-tight hover:underline"
        >
          {shop.name || shop.shop}
        </Link>
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span className="break-all">{shop.shop}</span>
          {shop.email && (
            <>
              <span aria-hidden className="hidden @3xl/main:inline">•</span>
              <span className="hidden break-all @3xl/main:inline">{shop.email}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const COLUMNS: ColumnDef<ShopListItem>[] = [
  {
    id: "shop",
    accessorFn: (shop) => shop.name || shop.shop,
    header: ({ column }) => <SortableHeader column={column} title="Shop" />,
    cell: ({ row }) => <ShopIdentity shop={row.original} />,
    enableHiding: false,
  },
  {
    id: "type",
    accessorFn: (shop) => (shop.isDevStore ? "Dev Store" : "Production"),
    header: "Type",
    cell: ({ row }) =>
      row.original.isDevStore ? (
        <Badge variant="secondary">Dev Store</Badge>
      ) : (
        <span className="text-sm text-muted-foreground">Production</span>
      ),
  },
  {
    id: "status",
    accessorFn: (shop) => (shop.active ? "Active" : "Uninstalled"),
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.original.active ? "outline" : "secondary"}>
        {row.original.active ? "Active" : "Uninstalled"}
      </Badge>
    ),
  },
  {
    id: "plan",
    accessorFn: (shop) => shop.planName,
    header: ({ column }) => <SortableHeader column={column} title="Plan" />,
    cell: ({ row }) => row.original.planName,
  },
  {
    id: "installed",
    accessorFn: (shop) => shop.installedAt,
    header: ({ column }) => (
      <div className="flex justify-end">
        <SortableHeader column={column} title="Installed" />
      </div>
    ),
    cell: ({ row }) => (
      <div className="text-right text-muted-foreground tabular-nums">
        {formatDate(LOCALE, row.original.installedAt, UTC)}
      </div>
    ),
  },
];

function NoShops() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Store />
        </EmptyMedia>
        <EmptyTitle>No shops yet</EmptyTitle>
        <EmptyDescription>The first install writes a row here.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function ShopsTable({ shops }: { shops: readonly ShopListItem[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={shops}
      getRowId={(shop) => shop.shop}
      compactHidden={["type", "plan", "installed"]}
      rowHref={(shop) => `/internal/shops/${encodeURIComponent(shop.shop)}`}
      search={{ placeholder: "Search shops…", text: (shop) => `${shop.name ?? ""} ${shop.shop}` }}
      toolbarStart={
        <p className="truncate text-sm text-muted-foreground">Every shop that has ever installed this app.</p>
      }
      empty={<NoShops />}
    />
  );
}
