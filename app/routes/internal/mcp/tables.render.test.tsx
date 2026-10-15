import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider, type RouteObject } from "react-router";
import type { McpAuditLog, McpClient, McpToken } from "~/db/schema";
import { TokensClientsTab } from "./tokens-clients-tab";
import { AuditLogsTab } from "./audit-logs-tab";

/**
 * The MCP tables, rendered through the real SSR path inside a router (the row
 * actions and the create dialog need one). Cells are asserted in the row they
 * belong to, so a label cannot pass by appearing somewhere else on the page.
 */
const NOW = 1_800_000_000_000;

function token(over: Partial<McpToken> = {}): McpToken {
  return {
    id: "tok-1",
    type: "pat",
    tokenHash: "hash",
    tokenPrefix: "pat_abc",
    clientId: null,
    adminUserId: null,
    label: "CI deploy",
    scopes: ["mcp:read"],
    parentTokenId: null,
    expiresAt: null,
    lastUsedAt: null,
    revokedAt: null,
    createdAt: 1,
    ...over,
  };
}

function client(over: Partial<McpClient> = {}): McpClient {
  return {
    id: "cli-1",
    clientId: "client-abc",
    clientSecretHash: null,
    clientSecretPrefix: null,
    clientName: "Claude Desktop",
    clientType: "public",
    registrationType: "dynamic",
    redirectUris: ["http://localhost/callback"],
    allowedScopes: ["mcp:read"],
    createdByAdminId: null,
    createdAt: 1_700_000_000_000,
    revokedAt: null,
    ...over,
  };
}

function log(over: Partial<McpAuditLog> = {}): McpAuditLog {
  return {
    id: "log-1",
    tokenId: null,
    clientId: null,
    actorEmail: "agent@workmanjsc.vn",
    actorType: "staff_pat",
    toolName: "get_shop",
    shop: "alpha.myshopify.com",
    isMutation: false,
    ok: true,
    latencyMs: 42,
    errorMessage: null,
    createdAt: 1_700_000_000_000,
    ...over,
  };
}

async function render(element: ReactElement): Promise<string> {
  const routes: RouteObject[] = [{ path: "/internal/mcp", Component: () => element, loader: () => null }];
  const context = await createStaticHandler(routes).query(new Request("https://example.test/internal/mcp"));
  if (context instanceof Response) throw new Error(`unexpected ${context.status}`);
  const html = renderToString(
    <StaticRouterProvider router={createStaticRouter(routes, context)} context={context} />,
  );
  expect(html.length, "rendered nothing — assertions would be vacuous").toBeGreaterThan(400);
  return html;
}

function plain(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Text of each body row of the `index`th table on the page. */
function bodyRows(html: string, index: number): string[] {
  const body = [...html.matchAll(/<tbody[^>]*>(.*?)<\/tbody>/gs)][index]?.[1] ?? "";
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((match) => plain(match[1]));
}

const noop = () => {};

function tab(tokens: McpToken[], clients: McpClient[]) {
  return <TokensClientsTab tokens={tokens} clients={clients} dialogOpen={false} setDialogOpen={noop} now={NOW} />;
}

describe("the access tokens table", () => {
  it("shows each token's status in its own row, from the clock the loader supplied", async () => {
    const html = await render(
      tab(
        [
          token({ id: "a", label: "Active one" }),
          token({ id: "b", label: "Expired one", expiresAt: NOW - 1 }),
          token({ id: "c", label: "Revoked one", revokedAt: NOW - 5 }),
        ],
        [],
      ),
    );
    const rows = bodyRows(html, 0);
    expect(rows.find((text) => text.includes("Active one"))).toMatch(/\bActive\b/);
    expect(rows.find((text) => text.includes("Expired one"))).toMatch(/\bExpired\b/);
    expect(rows.find((text) => text.includes("Revoked one"))).toMatch(/\bRevoked\b/);
  });

  it("offers an actions menu only for tokens that are not already revoked", async () => {
    const html = await render(
      tab([token({ id: "a", label: "Live" }), token({ id: "b", label: "Gone", revokedAt: 1 })], []),
    );
    expect(html).toContain('aria-label="Actions for Live"');
    expect(html).not.toContain('aria-label="Actions for Gone"');
  });

  it("says 'Never' for a token that was never used, and lists its scopes", async () => {
    const html = await render(tab([token({ scopes: ["mcp:read", "mcp:tickets:write"] })], []));
    const [row] = bodyRows(html, 0);
    expect(row).toContain("Never");
    expect(row).toContain("mcp:read");
    expect(row).toContain("mcp:tickets:write");
  });

  it("puts the generate action in the toolbar and an empty state in the body when there are no tokens", async () => {
    const html = await render(tab([], []));
    expect(html).toContain("Generate new token");
    expect(bodyRows(html, 0)).toEqual([expect.stringContaining("No personal access tokens yet")]);
    expect(bodyRows(html, 1)).toEqual([expect.stringContaining("No OAuth clients registered yet")]);
  });
});

describe("the OAuth clients table", () => {
  it("shows a client's name, id and redirect URI, and offers revoke only while it is active", async () => {
    const html = await render(
      tab([], [client(), client({ id: "cli-2", clientId: "client-old", clientName: "Old agent", revokedAt: 5 })]),
    );
    const rows = bodyRows(html, 1);
    const live = rows.find((text) => text.includes("Claude Desktop")) ?? "";
    expect(live).toContain("client-abc");
    expect(live).toContain("http://localhost/callback");
    expect(live).toMatch(/\bActive\b/);
    expect(rows.find((text) => text.includes("Old agent"))).toMatch(/\bRevoked\b/);
    expect(html).toContain('aria-label="Actions for Claude Desktop"');
    expect(html).not.toContain('aria-label="Actions for Old agent"');
  });
});

describe("the audit log table", () => {
  it("labels who acted, what kind of call it was and whether it worked, per row", async () => {
    const html = await render(
      <AuditLogsTab
        logs={[
          log({ id: "a", toolName: "get_shop" }),
          log({ id: "b", toolName: "reply_ticket", isMutation: true, ok: false, actorType: "oauth_agent" }),
        ]}
      />,
    );
    const rows = bodyRows(html, 0);
    const read = rows.find((text) => text.includes("get_shop")) ?? "";
    expect(read).toContain("Personal token");
    expect(read).toContain("Query");
    expect(read).toContain("200 OK");
    expect(read).toMatch(/\b42\s?ms\b/);
    const write = rows.find((text) => text.includes("reply_ticket")) ?? "";
    expect(write).toContain("OAuth agent");
    expect(write).toContain("Mutation");
    expect(write).toContain("Error");
  });

  it("shows an empty state in the body when nothing was logged", async () => {
    const html = await render(<AuditLogsTab logs={[]} />);
    expect(bodyRows(html, 0)).toEqual([expect.stringContaining("No activity logged yet")]);
  });
});
