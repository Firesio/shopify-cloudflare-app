---
name: add-mcp-tool
description: Add or change a tool on the app's MCP server (staff automation surface): registration, scope, catalog entry, audit, tests. Use for anything under app/mcp or app/routes/api/mcp.
---

# Add an MCP tool

The MCP server lets an agent operate the app as a staff member. Same use cases as the console, so a tool holds no business rule. Reference implementation with a send-scope split: `docs/campaigns.md`.

1. **Register** the tool in `app/mcp/tools/<domain>.ts` (`registerXTools(server, ctx)`); add a new domain file to `registerAllTools` in `app/mcp/tools/index.ts`.
   - Reads wrap the handler in `mcpRead(name, scope, ctx, fn)` with `READ_ONLY` annotations; writes use `mcpMutation(...)` with `MUTATION`. Both check the scope and write the audit row.
   - Input is a Zod shape with `.describe(...)` on every field. Call the service layer; never query D1 here.
2. **Scope**: use an existing scope from `app/domain/mcp/scopes.ts` or add one there. Preparing and irreversible/outward actions (emailing merchants) get **separate** scopes, and `mcp:admin` is the only scope that implies the others. An irreversible, outward scope must also go into `NEVER_FOR_DYNAMIC_CLIENTS` (`app/domain/mcp/scopes.ts`): a dynamically registered OAuth client (anyone can register one) may never be granted it, only a staff-made token; update the two consent tests in `app/routes/api/oauth/authorize.integration.test.ts`.
3. **Catalog**: add the tool to `TOOL_CATALOG` in `app/mcp/catalog.ts` (`name`, `domain`, `scope`, `isMutation`, `summary`); the console's MCP page reads it.
4. **Results** are structured JSON with a `next` hint; an expected failure returns `{ ok: false, reason, ... }` (a missing scope throws `Forbidden`). A tool that does something irreversible requires the number or id the human was shown, and its description tells the model not to call it unless the human asked.
5. **Audit**: `mcp_audit_logs` stores tool name, whether it mutated and the outcome, **never the arguments** (they may hold words or addresses).
   - **Who is calling**: `verifyBearerToken` (MCP and REST alike) refuses a token whose owning staff account is disabled or gone, on every request, and disabling or deleting a person revokes all their tokens, OAuth grants and unredeemed codes (`revokeAllForAdmin`). A new way to authenticate an agent must go through the same check (`ownerCanAct`); `app/services/mcp/disabled-admin.integration.test.ts` holds the cases.
6. **Tests**: drive the real HTTP bridge against local D1 like `app/routes/api/mcp/mcp.integration.test.ts` and `mcp-campaigns.integration.test.ts`: allowed, missing scope, invalid input.
