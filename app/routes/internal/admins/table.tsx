import type { ReactNode } from "react";
import { Link, useSubmit } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { EllipsisVertical } from "lucide-react";
import { Badge } from "~/internal/components/ui/badge";
import { Button } from "~/internal/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/internal/components/ui/dropdown-menu";
import { Spinner } from "~/internal/components/ui/spinner";
import { DataTable, SortableHeader } from "~/internal/components/data-table";
import { paths } from "~/urls";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { Locale } from "~/i18n/config";
import { ADMIN_ROLE_LABEL, ADMIN_STATUS_LABEL } from "~/internal/admin-messages";
import type { SafeAdminUser } from "~/db/schema";
import type { Intent } from "./intents.server";
import { RightAlignedSortableHeader } from "../table-columns";

const LOCALE: Locale = "en";

/** Whether the control for `intent` (optionally on row `id`) is the one submitting. */
export type IsPending = (intent: Intent, id?: string) => boolean;

interface RowActionsProps {
  readonly admin: SafeAdminUser;
  readonly busy: boolean;
  readonly isPending: IsPending;
  readonly onRemove: (admin: SafeAdminUser) => void;
}

/**
 * One menu per row instead of four buttons. Enable/disable and the role change
 * are the same POST the old buttons made (intent + id), sent with `useSubmit`;
 * removal is destructive, so it hands off to the page's confirmation dialog.
 */
function RowActions({ admin, busy, isPending, onRemove }: RowActionsProps) {
  const submit = useSubmit();
  const statusIntent: Intent = admin.status === "active" ? "disable" : "enable";
  const roleIntent: Intent = admin.role === "owner" ? "makeAdmin" : "makeOwner";
  const pending = isPending(statusIntent, admin.id) || isPending(roleIntent, admin.id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
          disabled={busy}
          aria-label={`Actions for ${admin.name}`}
        >
          {pending ? <Spinner /> : <EllipsisVertical />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void submit({ intent: statusIntent, id: admin.id }, { method: "post" })}>
          {admin.status === "active" ? "Disable" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void submit({ intent: roleIntent, id: admin.id }, { method: "post" })}>
          {admin.role === "owner" ? "Make admin" : "Make owner"}
        </DropdownMenuItem>
        {/* Its own page, not a dialog: the field needs to exist without
            JavaScript, and a portal's contents only render once opened. */}
        <DropdownMenuItem asChild>
          <Link to={paths.internal.resetAdminPassword(admin.id)} prefetch="intent">
            Reset password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => onRemove(admin)}>
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AdminColumnOptions {
  readonly actorId: string;
  readonly busy: boolean;
  readonly isPending: IsPending;
  readonly onRemove: (admin: SafeAdminUser) => void;
}

/** Columns that read nothing from the page: they depend only on the row. */
const ROW_COLUMNS: ColumnDef<SafeAdminUser>[] = [
  {
    id: "email",
    accessorFn: (admin) => admin.email,
    header: ({ column }) => <SortableHeader column={column} title="Email" />,
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
  },
  {
    id: "role",
    accessorFn: (admin) => admin.role,
    header: ({ column }) => <SortableHeader column={column} title="Role" />,
    cell: ({ row }) => (
      <Badge variant={row.original.role === "owner" ? "default" : "secondary"}>
        {ADMIN_ROLE_LABEL[row.original.role]}
      </Badge>
    ),
  },
  {
    id: "status",
    accessorFn: (admin) => admin.status,
    header: ({ column }) => <SortableHeader column={column} title="Status" />,
    cell: ({ row }) => (
      <Badge variant={row.original.status === "active" ? "outline" : "secondary"}>
        {ADMIN_STATUS_LABEL[row.original.status]}
      </Badge>
    ),
  },
  {
    // "Never" sorts as the oldest sign-in.
    id: "last sign-in",
    accessorFn: (admin) => admin.lastLoginAt ?? 0,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Last sign-in" />,
    cell: ({ row }) => (
      <div className="text-right tabular-nums text-muted-foreground">
        {row.original.lastLoginAt ? formatDateTime(LOCALE, row.original.lastLoginAt, UTC) : "Never"}
      </div>
    ),
  },
];

/** The name column marks your own row, so it needs to know who is signed in. */
function nameColumn(actorId: string): ColumnDef<SafeAdminUser> {
  return {
    id: "name",
    accessorFn: (admin) => admin.name,
    header: ({ column }) => <SortableHeader column={column} title="Name" />,
    enableHiding: false,
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.name}
        {row.original.id === actorId && (
          <Badge variant="secondary" className="ml-2">
            You
          </Badge>
        )}
      </span>
    ),
  };
}

function actionsColumn({ actorId, busy, isPending, onRemove }: AdminColumnOptions): ColumnDef<SafeAdminUser> {
  return {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    enableHiding: false,
    // Your own row has no actions: the guards would refuse them anyway, so
    // offering the menu is a lie.
    cell: ({ row }) =>
      row.original.id === actorId ? null : (
        <div className="flex justify-end">
          <RowActions admin={row.original} busy={busy} isPending={isPending} onRemove={onRemove} />
        </div>
      ),
  };
}

export function AdminsTable({
  admins,
  toolbarStart,
  toolbarEnd,
  ...options
}: AdminColumnOptions & {
  readonly admins: readonly SafeAdminUser[];
  readonly toolbarStart: ReactNode;
  readonly toolbarEnd: ReactNode;
}) {
  return (
    <DataTable
      columns={[nameColumn(options.actorId), ...ROW_COLUMNS, actionsColumn(options)]}
      data={admins}
      getRowId={(admin) => admin.id}
      stickyEnd="actions"
      compactHidden={["email", "last sign-in"]}
      search={{ placeholder: "Search admins…", text: (admin) => `${admin.name} ${admin.email}` }}
      toolbarStart={toolbarStart}
      toolbarEnd={toolbarEnd}
    />
  );
}
