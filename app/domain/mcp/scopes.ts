/**
 * Standard MCP and API permission scopes.
 *
 * Scopes are hierarchical:
 * - `mcp:admin` satisfies any `mcp:*` scope.
 * - `mcp:read` satisfies read-only permissions across all domains.
 * - `mcp:campaigns:send` is separate from `mcp:campaigns:write` on purpose: preparing an announcement and emailing real
 *   merchants are different powers, and neither `mcp:read` nor `mcp:campaigns:write` implies the other.
 */
export const MCP_SCOPES = [
  "mcp:read",
  "mcp:tickets:write",
  "mcp:shops:read",
  "mcp:shops:write",
  "mcp:campaigns:write",
  "mcp:campaigns:send",
  "mcp:admin",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

/**
 * What a dynamically registered client MAY be granted: every scope except `mcp:admin` (which only covers the others). Read at
 * consent time, not from the row stored at registration, so clients registered before a scope existed are not stuck without it.
 * A ceiling, not a grant: the person still ticks each scope on the consent page.
 */
export const DYNAMIC_CLIENT_SCOPES: readonly McpScope[] = MCP_SCOPES.filter((scope) => scope !== "mcp:admin");

/** Every scope this client may be granted, in the console's order. A dynamic client gets today's ceiling, whatever its row says. */
export function allowedScopesOf(client: { allowedScopes: readonly string[]; registrationType: string }): McpScope[] {
  const allowed: readonly string[] = client.registrationType === "dynamic" ? DYNAMIC_CLIENT_SCOPES : client.allowedScopes;
  return MCP_SCOPES.filter((scope) => allowed.includes(scope));
}

export const DEFAULT_MCP_SCOPES: readonly McpScope[] = ["mcp:read"];

export const SCOPE_DESCRIPTIONS: Record<McpScope, { label: string; description: string }> = {
  "mcp:read": {
    label: "Read Platform & Ticket Data",
    description: "Read-only access to support tickets, shops, metrics, and health.",
  },
  "mcp:tickets:write": {
    label: "Manage & Reply to Tickets",
    description: "Reply to tickets (sends emails to merchants), update statuses, and create tickets.",
  },
  "mcp:shops:read": {
    label: "Inspect Stores & History",
    description: "View store details, subscription tiers, and installation history.",
  },
  "mcp:shops:write": {
    label: "Update Store Metadata",
    description: "Update store flags such as marking or unmarking development stores.",
  },
  "mcp:campaigns:write": {
    label: "Draft & Manage Announcements",
    description:
      "Create, edit and delete draft announcements, send a test copy to the token owner only, and pause, resume or cancel one. Never emails merchants.",
  },
  "mcp:campaigns:send": {
    label: "Send Announcements to Merchants",
    description:
      "Start a real send: emails the whole audience of merchants, and it cannot be undone. Grant only to agents a person supervises.",
  },
  "mcp:admin": {
    label: "Full Admin Access",
    description: "Unrestricted access across all current and future tools and endpoints.",
  },
};

/** Validate if a string is a recognized McpScope. */
export function isMcpScope(value: string): value is McpScope {
  return MCP_SCOPES.some((scope) => scope === value);
}

/** Parse and deduplicate raw scopes from a space-separated string or array. */
export function parseScopes(input: string | readonly string[] | null | undefined): McpScope[] {
  if (!input) return [...DEFAULT_MCP_SCOPES];
  const rawList = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.trim().split(/\s+/)
      : [];
  const recognized = new Set<McpScope>();
  for (const item of rawList) {
    const trimmed = item.trim();
    if (isMcpScope(trimmed)) {
      recognized.add(trimmed);
    }
  }
  return recognized.size > 0 ? Array.from(recognized) : [...DEFAULT_MCP_SCOPES];
}

/** Check if granted scopes satisfy the required scope. */
export function hasRequiredScope(
  grantedScopes: readonly string[],
  requiredScope: string,
): boolean {
  if (grantedScopes.includes("mcp:admin")) return true;
  if (grantedScopes.includes(requiredScope)) return true;

  // mcp:read satisfies any read tool
  if (requiredScope.endsWith(":read") && grantedScopes.includes("mcp:read")) {
    return true;
  }

  return false;
}
