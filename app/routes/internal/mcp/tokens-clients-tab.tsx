import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, Plug } from "lucide-react";
import { Badge } from "~/internal/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/internal/components/ui/empty";
import { DataTable, SortableHeader } from "~/internal/components/data-table";
import type { listPersonalAccessTokens } from "~/services/mcp/tokens.server";
import type { listOAuthClients } from "~/services/mcp/oauth.server";
import { formatDateTime } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";
import type { Locale } from "~/i18n/config";
import { RightAlignedSortableHeader } from "../table-columns";
import { CreateTokenDialog } from "./create-token-dialog";
import { RevokeAction } from "./revoke-action";

const LOCALE: Locale = "en";

type Token = Awaited<ReturnType<typeof listPersonalAccessTokens>>[number];
type Client = Awaited<ReturnType<typeof listOAuthClients>>[number];

type TokenStatus = "Active" | "Expired" | "Revoked";

function tokenStatus(token: Token, now: number): TokenStatus {
  if (token.revokedAt !== null) return "Revoked";
  if (token.expiresAt !== null && now > token.expiresAt) return "Expired";
  return "Active";
}

function StatusBadge({ status }: { status: TokenStatus }) {
  return <Badge variant={status === "Revoked" ? "destructive" : "outline"}>{status}</Badge>;
}

/** The heading that sits where dashboard-01 puts the view switcher: left of the toolbar. */
function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function EmptyList({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

const TOKEN_COLUMNS: ColumnDef<Token>[] = [
  {
    id: "label",
    accessorFn: (token) => token.label,
    header: ({ column }) => <SortableHeader column={column} title="Label" />,
    enableHiding: false,
    cell: ({ row }) => <span className="font-medium">{row.original.label}</span>,
  },
  {
    id: "prefix",
    accessorFn: (token) => token.tokenPrefix,
    header: "Prefix",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.tokenPrefix}...</span>,
  },
  {
    id: "scopes",
    accessorFn: (token) => token.scopes.join(" "),
    header: "Scopes",
    enableSorting: false,
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.scopes.map((scope) => (
          <Badge key={scope} variant="outline">
            {scope}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    // A token that was never used sorts as the oldest.
    id: "last used",
    accessorFn: (token) => token.lastUsedAt ?? 0,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Last used" />,
    cell: ({ row }) => (
      <div className="text-right text-xs tabular-nums text-muted-foreground">
        {row.original.lastUsedAt ? formatDateTime(LOCALE, row.original.lastUsedAt, UTC) : "Never"}
      </div>
    ),
  },
];

/** Status depends on the clock, which the loader hands the page as `now`. */
function tokenStatusColumn(now: number): ColumnDef<Token> {
  return {
    id: "status",
    accessorFn: (token) => tokenStatus(token, now),
    header: ({ column }) => <SortableHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={tokenStatus(row.original, now)} />,
  };
}

const TOKEN_ACTIONS_COLUMN: ColumnDef<Token> = {
  id: "actions",
  header: () => <span className="sr-only">Actions</span>,
  enableSorting: false,
  enableHiding: false,
  cell: ({ row }) =>
    row.original.revokedAt === null ? (
      <div className="flex justify-end">
        <RevokeAction
          intent="revoke_token"
          idField="token_id"
          id={row.original.id}
          name={row.original.label}
          noun="token"
        />
      </div>
    ) : null,
};

function TokensSection({
  tokens,
  dialogOpen,
  setDialogOpen,
  now,
}: {
  tokens: Token[];
  dialogOpen: boolean;
  setDialogOpen: (o: boolean) => void;
  now: number;
}) {
  return (
    <DataTable
      columns={[...TOKEN_COLUMNS, tokenStatusColumn(now), TOKEN_ACTIONS_COLUMN]}
      data={tokens}
      getRowId={(token) => token.id}
      stickyEnd="actions"
      compactHidden={["prefix", "scopes", "last used"]}
      toolbarStart={
        <SectionHeading
          title="Personal access tokens"
          description="Static bearer tokens with customizable scopes for scripts and AI agents."
        />
      }
      toolbarEnd={<CreateTokenDialog dialogOpen={dialogOpen} setDialogOpen={setDialogOpen} />}
      empty={
        <EmptyList
          icon={<KeyRound />}
          title="No personal access tokens yet"
          description="Generate a token to let a script or AI agent call the MCP server and REST API."
        />
      }
    />
  );
}

const CLIENT_COLUMNS: ColumnDef<Client>[] = [
  {
    id: "client name",
    accessorFn: (client) => client.clientName,
    header: ({ column }) => <SortableHeader column={column} title="Client name" />,
    enableHiding: false,
    cell: ({ row }) => <span className="font-medium">{row.original.clientName}</span>,
  },
  {
    id: "client id",
    accessorFn: (client) => client.clientId,
    header: "Client ID",
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.clientId}</span>,
  },
  {
    id: "redirect uris",
    accessorFn: (client) => client.redirectUris.join(", "),
    header: "Redirect URIs",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="block max-w-xs truncate text-xs text-muted-foreground" title={row.original.redirectUris.join(", ")}>
        {row.original.redirectUris.join(", ")}
      </span>
    ),
  },
  {
    id: "registered",
    accessorFn: (client) => client.createdAt,
    header: ({ column }) => <RightAlignedSortableHeader column={column} title="Registered" />,
    cell: ({ row }) => (
      <div className="text-right text-xs tabular-nums text-muted-foreground">
        {formatDateTime(LOCALE, row.original.createdAt, UTC)}
      </div>
    ),
  },
  {
    id: "status",
    accessorFn: (client) => (client.revokedAt === null ? "Active" : "Revoked"),
    header: ({ column }) => <SortableHeader column={column} title="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.revokedAt === null ? "Active" : "Revoked"} />,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    enableSorting: false,
    enableHiding: false,
    cell: ({ row }) =>
      row.original.revokedAt === null ? (
        <div className="flex justify-end">
          <RevokeAction
            intent="revoke_client"
            idField="client_id"
            id={row.original.id}
            name={row.original.clientName}
            noun="client"
          />
        </div>
      ) : null,
  },
];

function ClientsSection({ clients }: { clients: Client[] }) {
  return (
    <DataTable
      columns={CLIENT_COLUMNS}
      data={clients}
      getRowId={(client) => client.id}
      stickyEnd="actions"
      compactHidden={["client id", "redirect uris", "registered"]}
      toolbarStart={
        <SectionHeading title="Registered OAuth 2.0 clients" description="Dynamically registered agents via RFC 7591." />
      }
      empty={
        <EmptyList
          icon={<Plug />}
          title="No OAuth clients registered yet"
          description="Connect an agent via Zero-Touch OAuth to see it here."
        />
      }
    />
  );
}

export function TokensClientsTab({
  tokens,
  clients,
  dialogOpen,
  setDialogOpen,
  now,
}: {
  tokens: Token[];
  clients: Client[];
  dialogOpen: boolean;
  setDialogOpen: (o: boolean) => void;
  now: number;
}) {
  return (
    <div className="flex flex-col gap-8">
      <TokensSection tokens={tokens} dialogOpen={dialogOpen} setDialogOpen={setDialogOpen} now={now} />
      <ClientsSection clients={clients} />
    </div>
  );
}
