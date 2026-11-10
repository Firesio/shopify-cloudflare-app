---
paths:
  - "app/domain/campaign*"
  - "app/models/campaign*"
  - "app/services/campaign*"
  - "app/adapters/campaign*"
  - "app/wiring/campaigns*"
  - "app/mcp/tools/campaign*"
  - "app/emails/templates/campaign*"
  - "app/schemas/campaign*"
  - "app/lib/unsubscribe-token*"
  - "app/routes/public/unsubscribe*"
  - "app/routes/internal/campaigns/**"
---

# Campaigns — one announcement, many merchants

A **campaign** is an announcement the team writes once and emails to many merchants ("a big update ships next week").
The console calls it an announcement; the code says campaign. It is written and sent from the internal console, or by an
AI agent holding an MCP token (`app/mcp/tools/campaigns.ts`): both go through the same use cases, so there is one set of
rules and one set of guards.

```
write (draft) → choose who → preview the exact number → [send me a test] → send
                                                                 │
  start: ONE atomic step fixes the recipients (campaign_recipients) and moves draft → sending
                                                                 ▼
  queue step ──▶ pump one page (25) ──▶ settle each recipient ──▶ judge ──▶ schedule next step (2 s gap)
      ▲                                                              │ pause: no channel / most of a sample bouncing
      └──────── watchdog (cron) restarts a chain that went quiet ◀───┘
```

## Where each decision lives

| Decision | File | Ring |
|---|---|---|
| What a campaign says: limits, checks, lifecycle (`draft → sending ⇄ paused → sent`, `cancelled`) | `app/domain/campaign.ts` | 1 |
| Who may receive it, in words (a filter registry) | `app/domain/campaign-audience.ts` | 1 |
| Pacing, when to carry on / slow down / stop, what to do with each mail's outcome | `app/domain/campaign-delivery.ts` | 1 |
| The filter as a query, and the preview counts | `app/models/campaign-audience.server.ts` | 4 |
| The only queries on `campaigns`, `campaign_recipients` | `app/models/campaigns.server.ts` | 4 |
| Unsubscribe list (the only queries on it) | `app/models/campaign-unsubscribes.server.ts` | 4 |
| Draft, start, pump (one delivery step), pause/resume/cancel, watchdog, test send | `app/services/campaigns/*.ts` (facade `app/services/campaigns.server.ts`) | 3 |
| The queue message and its consumer | `app/services/campaign-queue.ts`, `app/adapters/campaign-queue.server.ts` | 3, 4 |
| Mail through the one pipeline (`notify()`), deduplicated per campaign and shop | `app/adapters/campaign-mailer.server.ts` | 4 |
| The mail itself | `app/emails/templates/campaign-message.tsx`, event `campaign_message` in `app/notifications/` | 1/5 |
| Everything bound together | `app/wiring/campaigns.server.ts` | 5 |
| The signed unsubscribe link and its public page | `app/lib/unsubscribe-token.ts`, `app/routes/public/unsubscribe*.ts(x)` | 1, 5 |

## Rules that never change

- **Only a draft can be edited or deleted.** Once recipients are fixed, the words that went to them stay what they were.
  A sent or cancelled campaign is final; copy it to say it again.
- **Starting is the one step that cannot be taken back, so it is checked hardest.** `startCampaign` takes
  `expectedRecipients`, the number the reviewer was SHOWN: if the audience is a different size now, nothing starts and the
  caller sees the new number. The write also checks the draft was not edited since it was read (`version`), and fixes the
  recipients in the same batch as the move to `sending`, so a campaign is never `sending` with nobody to send to.
- **Nobody can switch off the safety filters**: only shops where the app is still installed, only an address we hold, never
  an address that unsubscribed. They are not audience filters (`models/campaign-audience.server.ts`).
- **Recipients are fixed at start.** A shop that installs afterwards is not added; one that unsubscribes afterwards is
  skipped at its turn (`unsubscribed`), and the report says so.
- **One mail per recipient, ever.** Every mail has the dedupe key `campaign:<id>:<shop>`, and a recipient is settled only
  while still pending, so a replayed step sends nothing twice (tested through the real pipeline).
- **Delivery is paced and can stop itself.** One page of 25 per step with a 2 s gap; a transient provider error backs the
  chain off for 5 minutes and is retried up to 3 times per recipient; no mail channel at all, or half of a sample of 10+
  bouncing, PAUSES the campaign (`pauseReason`) for a person to look at, because both get worse with every mail sent.
- **The step is the consumer.** It sends inside the queue message (not through the queued notifier) because it must learn
  each mail's outcome to pace and to stop. A step that throws is retried by the queue and resumes from whoever is pending.
- **Unsubscribe is a POST.** A GET that unsubscribed would be fired by mail scanners and link previews. The link is signed
  (HMAC, purpose-prefixed, no expiry on purpose) and the page shows the address masked. The list is keyed on the address
  and is deliberately NOT erased by `shop/redact`: a merchant who was erased and reinstalls must not be written to again.
- `campaigns` is not shop-scoped (it belongs to our team, like `admin_users`); `campaign_recipients` carries `shop` and is
  erased by the tenant purge.

## What an app changes, and the cost

| Change | Where | Cost |
|---|---|---|
| A new audience filter (a plan, a country, "has used feature X") | key + field in `domain/campaign-audience.ts`, its words there, its query in `AUDIENCE_CONDITIONS` in the model, the stored/edited schema in `app/schemas/campaign.ts` | the compiler names each one missed |
| The recipient is not the shop's owner address (e.g. every member) | `shopAddress` in the audience model and the `start` insert-select | one query; recipients stay one row per (campaign, address-owner) |
| Pace and thresholds | constants in `domain/campaign-delivery.ts` | one value; `campaign-delivery.test.ts` pins them |
| Who may send from the console / over MCP | MCP scope `mcp:campaigns:send` (see below); the console is for signed-in staff. A dynamically registered OAuth client can never be granted it (`NEVER_FOR_DYNAMIC_CLIENTS`), only a staff-made token | one scope check |
| The wording around the team's words (footer, unsubscribe line) | `campaign.*` in the `email` catalogue (en, es) | translation keys |

## Queue and deploy

`CAMPAIGN_QUEUE` (`campaigns` / `campaigns-prod`, DLQ `campaigns-dlq` / `campaigns-dlq-prod`) is its own queue, with the
written reason that an announcement's pacing and retries must never share a line with a password reset or a support
reply. Create the production queues with `wrangler queues create campaigns-prod` and `campaigns-dlq-prod`. Named
environments do not inherit bindings: it is declared at the top level AND under `env.production`. The unsubscribe link uses
`ATTACHMENT_TOKEN_SECRET` (purpose-prefixed, so the same secret cannot forge an attachment link) and `SHOPIFY_APP_URL`.

## Deeper reference

The MCP tools (scopes, `start_campaign` guard, audit) and what is verified or not: `docs/campaigns.md`. New MCP tools: the `add-mcp-tool` skill.
