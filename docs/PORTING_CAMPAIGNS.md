# Porting campaigns to another app built on this template

A **campaign** here is an announcement the team writes once and emails to many **merchants** from the staff console
(`/internal/**`), or that an AI agent drafts and sends through the app's MCP server. It is NOT the customer-facing mail an
app may already have (a shop emailing its own buyers: `customer_campaign`, `marketing_outreach`). Keep the two apart in the
code and in the words: this one's recipients are the app's merchants, and the sender is the team.

Read `.claude/rules/campaigns.md` first: it holds the rules, the flow and what is verified. This file is only the porting
plan. The template commit that introduced it is the reference; every path below is relative to the template root.

## 1. What to copy, and what to change

Copy the files as they are unless the "change" column says otherwise.

### Core (pure: copy verbatim, with its test)

| File | Change |
|---|---|
| `app/domain/campaign.ts` (+ test) | none |
| `app/domain/campaign-audience.ts` (+ test) | **the filters are the app's choice**: keep `kind` (real / dev / all) and the two install dates, add the app's own (plan, country, "uses feature X") following the recipe in the file header |
| `app/domain/campaign-delivery.ts` (+ test) | none; pace and thresholds are constants at the top |
| `app/lib/hmac.ts`, `app/lib/unsubscribe-token.ts` (+ test) | none (needs `app/lib/base64url.ts`, which the template already has; copy it if the app lacks it) |
| `app/schemas/campaign.ts` (+ test) | follows the audience filters |
| `app/ports/campaigns.ts` | none |

### Data

| File | Change |
|---|---|
| `app/db/schema/campaigns.ts`, export in `app/db/schema.ts` | `campaigns` and `campaign_unsubscribes` have **no `shop` column on purpose** (they belong to the team; same precedent as `admin_users`). `campaign_recipients` carries `shop`. If the app's rule is "every table is shop-scoped", record this as the same kind of exception the template makes for `admin_users` and `redacted_shops`, with the reason, in the app's `data.md`. `created_by` references `admin_users(id)`: adapt it to the app's staff table |
| migration | **do not copy the template's SQL.** Run `npm run db:generate` in the app so the file gets the app's own number and snapshot (the template's is `0036_neat_saracen.sql`) |
| `app/models/campaigns.server.ts`, `campaign-audience.server.ts`, `campaign-unsubscribes.server.ts` (+ `campaigns.test.ts`) | `campaign-audience.server.ts` reads the app's `shops` table: check the column names it uses (`email`, `contactEmail`, `name`, `isDevStore`, `installedAt`, `uninstalledAt`) exist, or adapt `shopAddress` and the conditions. All three are the only files that touch Drizzle for campaigns |
| `app/models/tenant-purge.server.ts` and its test | add `campaign_recipients` to the purged tables (it names the shop and holds its address). `campaigns` and `campaign_unsubscribes` stay: the first is ours, the second is a suppression list that must survive a `shop/redact` |

### Use cases (ring 3)

Copy `app/services/campaigns/*.ts` (types, payload, draft, start, pump, control, restart-stalled, send-test),
`app/services/campaigns.server.ts` (facade), `app/services/campaign-queue.ts` and its tests. They import only ports and the
core. The consumer reuses `retryDelaySeconds` from `app/services/notification-queue.ts`: the app needs an equivalent
(or copy the function).

### Adapters, queue, wiring

| File | Change |
|---|---|
| `app/adapters/campaign-mailer.server.ts` (+ test), `campaign-queue.server.ts` (+ test) | the mailer calls the template's `notify()`; **point it at the app's own notification pipeline** and keep the contract: one `notify` per recipient with `dedupeKey: campaign:<campaignId>:<shop>`, and a retriable provider error must surface as a throw/result the mailer maps to `transient` |
| `app/wiring/campaigns.server.ts` (+ integration test) | bind to the app's composition root. The unsubscribe link needs a signing secret (template: `ATTACHMENT_TOKEN_SECRET`, purpose-prefixed) and the app origin (`SHOPIFY_APP_URL`) |
| `wrangler.jsonc` | new queue `CAMPAIGN_QUEUE` (`campaigns`, DLQ `campaigns-dlq`) at the top level **and** under `env.production` (named envs do not inherit): producer, consumer with `max_retries: 8` and the DLQ. Then `npm run cf-typegen` |
| `app/lib/queue-names.ts` (+ test), `workers/app.ts` | add `CAMPAIGN_QUEUE_NAMES`, the `"campaign"` kind, and the `if (kind === "campaign")` branch that runs `handleCampaignBatch` |
| cron: `app/ports/scheduled.ts`, `app/services/scheduled.server.ts`, scheduled wiring | add the `campaignWatchdog` sweep (runs every tick); update the tests that list the sweeps (`workers/app.test.ts`, `scheduled.test.ts`) |

### The mail

| File | Change |
|---|---|
| event `campaign_message` in `app/notifications/{types,catalogue,payloads,envelope}.ts`, push builder (`null`), `app/test/notification-payloads.ts` | audience `merchant`, gate `caller_gated` (the campaign layer leaves out unsubscribed addresses; the channel-wide opt-out still applies underneath). **If the app already has `customer_campaign` / `marketing_outreach`, keep this one separate** and consider a clearer name for it (for example `merchant_announcement`) |
| `app/emails/templates/campaign-message.tsx` (+ test), registry entry | uses the app's email layout components (`EmailLayout`, `Cta`, `Muted`, `P`); adapt to its own |
| text unit `email.campaign` and `campaign.*` keys in `email.json` | one language per locale the app ships; then `npm run i18n:sync` |

### Public unsubscribe page

`app/routes/public/unsubscribe.tsx`, `unsubscribe.server.ts` (+ tests), the route in `app/routes.ts`
(`unsubscribe/:token`), `paths.unsubscribe` in `app/urls.ts`, the `unsubscribe.*` keys in `public.json` and the
`public.unsubscribe` text unit. It is a public page, so it follows the app's public styling (SCSS tokens), not shadcn.

### Staff console (shadcn, English only)

Copy `app/routes/internal/campaigns/*` (list, draft editor in three steps, report, intents registry, loaders, polling
bounded to 120 polls and paused when the tab is hidden), `app/services/internal-admin/campaign-ops.server.ts`, the "Campaigns"
entry in `app/routes/internal/layout-nav.ts` and its test, the two test helpers `app/test/campaign-views.ts` and
`app/test/html-queries.ts`, and the route registration. **Change:** how the signed-in admin is read
(`action.server.ts` uses the template's `requireAdminUser`, `adminUsers()` and `isSameOriginRequest`) and the shadcn components it imports
(`~/internal/components/ui/*`): it needs `alert`, `alert-dialog`, `badge`, `breadcrumb`, `button`, `card`, `empty`, `field`,
`input`, `progress`, `radio-group`, `sonner`, `spinner`, `tabs`, `textarea` and the template's `DataTable`
(`app/internal/components/data-table.tsx`); install any that are missing with `npx shadcn@latest add`.

### MCP

`app/mcp/tools/campaigns.ts`, `campaign-results.ts`, registration in `tools/index.ts`, the "Campaigns" block in
`app/mcp/catalog.ts`, the two scopes in `app/domain/mcp/scopes.ts` (+ tests), and
`app/services/internal-admin/campaign-mcp-ops.server.ts`. **Two things must carry over exactly:**
`mcp:campaigns:send` is implied by neither `write` nor `read`, and `start_campaign` requires `expectedRecipients`. Also keep
the actor fix: the template's `ctx.actorEmail` is the token's label, not an address, so `McpActorContext.adminUserId` is
passed from the route and `resolveCampaignActor` looks up the owning staff account. Check what the app's token verifier puts
in `actorEmail` before assuming it is an address.

## 2. Fitting the app's rules

| The app's rule | How campaigns meet it, and what to check |
|---|---|
| Drizzle only in `app/models` | all queries are in the three models. Services and routes receive ports. Check no route imports a model (the template's console reads through `campaign-ops.server.ts`) |
| Every query shop-scoped, `shop` first parameter | `campaign_recipients` queries filter by campaign id and shop. The three team-level tables are the documented exception (see Data). The audience query is over the whole `shops` table by design: a campaign's audience IS the set of shops |
| Ports only at the outer boundary | ports: store, audience, unsubscribes, mailer, test mailer, queue. Everything else is plain functions and data |
| Consumer idempotent with a dedupe key | the dedupe key is `campaign:<id>:<shop>` and a recipient is settled only while pending, so a replayed step sends nothing twice. Keep both. The template proves it through the real pipeline (`app/wiring/campaigns.integration.test.ts`): copy that test and point it at the app's mail boundary |
| State machine for lifecycles | `CAMPAIGN_TRANSITIONS` in `domain/campaign.ts` is the data; every move goes through `canTransition`, and the store's `transition` is conditional on the current status (the race check) |
| Money as integer minor units | campaigns carry no money. If an audience filter uses revenue or plan price, use the app's money module and compare integers |
| Internal console English only, shadcn | the console strings are English literals by that rule. The words a MERCHANT reads (the mail's footer and unsubscribe line, the public page) ARE translated |

## 3. Order of work

1. **Schema and migration**: add `app/db/schema/campaigns.ts`, export it, `npm run db:generate`, check the SQL, apply locally.
2. **Core and ports**: copy the domain, `lib`, schemas and ports with their tests; `npx vitest run app/domain app/lib app/schemas`.
3. **Models and purge**: copy the three models, adapt the audience query, add the purge entries; `npx vitest run app/models`.
4. **Notification event and email**: the event, template, registry, locale keys; `npm run i18n:sync`; run the notification tests.
5. **Use cases, queue and wiring**: services, consumer, adapters, wiring, `wrangler.jsonc`, `cf-typegen`, the worker branch and the watchdog sweep; `npx vitest run app/services app/wiring workers`.
6. **Unsubscribe page**: route, logic, strings; `npx vitest run app/routes/public`.
7. **Console**: services facade, routes, nav, helpers; `npx vitest run app/routes/internal`.
8. **MCP**: scopes, tools, catalogue, actor fix; `npx vitest run app/routes/api/mcp app/domain/mcp`.
9. `npm run verify`, then `npx react-router build`.

## 4. Unverified, and not in the template

- **No real send has been made.** Delivery, bounces and the sender's daily and hourly limits were not exercised or looked
  up. Before the first large send, send a campaign to an audience of yourself through the real sender.
- **Rate limits.** The pace (25 recipients per step, 2 s apart, 5 minutes back-off on a transient error) is a safe guess,
  not a measured limit. It lives in `domain/campaign-delivery.ts`; the stop conditions (no channel, half of 10+ bouncing)
  are the real protection for the sending domain.
- **Unsubscribe is a link in the body only.** `List-Unsubscribe` and `List-Unsubscribe-Post` headers are not set: whether
  the mail provider's header allowlist permits them was not checked, and bulk senders to Gmail and Yahoo are expected to
  offer one-click unsubscribe.
- **The audience is one address per shop** (the account owner's, else the store contact). It does not reach every member of
  a shop (the template's members feature is separate). Changing that is `shopAddress` and the `start` insert-select.
- **No scheduling.** A campaign is sent when someone presses send; "send next Tuesday at 9" is not built (the draft is the
  place to wait). The cron watchdog restarts a stalled chain; it does not start campaigns.
- **The console list has no progress column** (it would need one batched counts query on the store); the report page shows
  progress.
- **MCP audit** records the tool and the outcome but not the campaign id.
- **Browser checks** of the console were done in the template on desktop width only (list, editor, preview, send dialog,
  report, resume, test send); phone widths, light mode and the cancel and delete dialogs were not looked at by eye.
- **The email** was rendered in tests, never opened in a real mail client.
