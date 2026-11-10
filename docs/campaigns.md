# Campaigns — MCP surface and verification

Reference for `.claude/rules/campaigns.md`. Not loaded automatically.

## MCP — an agent drafts, a person approves, the send is its own scope

`app/mcp/tools/campaigns.ts` (shaping in `campaign-results.ts`, reads and the actor in
`app/services/internal-admin/campaign-mcp-ops.server.ts`) exposes 11 tools over the same use cases as the console.

| Scope | Tools |
|---|---|
| `mcp:read` | `list_campaigns`, `get_campaign` (recipient sample capped at 50), `preview_campaign_audience` |
| `mcp:campaigns:write` | `create_campaign` (draft only), `update_campaign`, `delete_campaign`, `send_campaign_test`, `pause_campaign`, `resume_campaign`, `cancel_campaign` |
| `mcp:campaigns:send` | `start_campaign` (emails real merchants) |

- `send` is implied by neither `write` nor `read` (only `mcp:admin` covers it). Preparing and sending are separate powers; a dynamically registered OAuth client may be granted any scope but `mcp:admin` and `mcp:campaigns:send` (`NEVER_FOR_DYNAMIC_CLIENTS` in `app/domain/mcp/scopes.ts`): anyone can register a client with a convincing name, and emailing every merchant cannot be undone, so `send` goes only on a personal access token (or a manually registered client) that a signed-in staff member creates in the console and ticks on purpose. The consent page lets the person tick which of the rest to grant (it opens with what the client asked for); the console's default token checkboxes do not include either new scope.
- `start_campaign` REQUIRES `expectedRecipients`, the number the human saw in the latest `create_campaign`, `update_campaign`, preview or `get_campaign`. A different current size returns `audience_changed` with the new count and sends nothing. Its description tells the model not to call it unless the human explicitly asked to send.
- `send_campaign_test` mails only the staff account that owns the token. `ctx.actorEmail` is the token's LABEL, not an address, so the owner is resolved from `ctx.adminUserId` (`resolveCampaignActor`); a token with no resolvable owner gets `no_owner_address` and nothing is sent.
- Results are structured JSON with a `next` hint. Invalid content or a bad date returns `{ ok: false, reason: "invalid", errors: [{ field, fault, message }] }` (not a thrown error). A missing scope throws `Forbidden`.
- The audit log (`mcp_audit_logs`) stores the tool name, whether it mutated and the outcome, never the arguments: no words, no address. It does not record the campaign id (the wrapper records only a `shop` argument); the campaign's own `createdByEmail` and the `campaign.*` log lines (id and `by: "token"`) are the trail.
- Tests: `app/routes/api/mcp/mcp-campaigns.integration.test.ts` drives the real HTTP bridge against local D1. The test mail is refused locally (no `EMAIL_FROM`), so it asserts `delivered: false`.

## Verified, and not

Verified by tests with real local D1 and the real pipeline up to the Email Sending binding (which is replaced): a full
send of several merchants, exactly one mail each, a replayed step sending nothing, each mail's own unsubscribe link,
pause/resume/cancel, the watchdog, the audience safety filters, the tenant purge.

**Not verified — check before relying on it:**
- A real send through Cloudflare Email Sending: delivery, bounces, and the account's daily/hourly limits were not looked up
  or exercised. Do a small real send (an audience of yourself) before the first large one.
- The `List-Unsubscribe` / `List-Unsubscribe-Post` headers are NOT set: whether Email Sending's header allowlist permits them
  was not checked. Large senders to Gmail/Yahoo are expected to offer one-click unsubscribe; until the headers exist, the
  link in the body is the only way.
- Whether Gmail and Outlook thread or filter these mails as promotions.
- The page layout of the console screens and of the email in real mail clients was not checked by eye.
