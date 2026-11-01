# Agent contract

**This file is the single source of truth for how to work in this repo.**
`CLAUDE.md` is a one-line pointer at it; there is no second copy to keep in sync.
This repo is set up for Claude Code only.

Detailed rules live in `.claude/rules/` and are pulled in by the `@` links at the
end of each section. They carry `globs` frontmatter, so hosts that scope rules by
path can use them that way instead.

**Shopify work goes through the Shopify AI Toolkit skills** — see the section
below. Skills are installed once per machine, not per project — see
"AI-agent skills" in `README.md`.

---

# Template placeholders are not real data

Anything marked `TODO:` or using a reserved example value (`@example.com`,
`example.org`) in `app/identity.ts`, `app/legal/content.ts`, locale files,
`app/billing/plans.ts`, `wrangler.jsonc` and the `shopify.app*.toml` files is
**template data, not the product's real values**. It exists so the template
builds; it is never a decision someone made.

- **Replace every one of them** when you touch the surface that uses it. Do not
  copy a placeholder into new code, tests or docs as if it were true, and do not
  leave a `TODO:` behind in something you shipped.
- If you do not know the real value (legal address, app name, price), **ask**.
  Never invent one and never "fix" the placeholder check to get past it.
- `npm run check:placeholders` is the gate. It is expected to fail on a fresh
  template and must pass before a production deploy. Steps and the full list:
  `docs/ADOPTING_THE_TEMPLATE.md`.

## This repo is a template shared by many apps

Firesio runs many apps from this one template, each on its own subdomain of
`firesio.app`. **Nothing app-specific may be hardcoded into shared code.**

- Company: `Firesio`. Shared parent domain: `firesio.app`.
- Every app lives at `<app>.firesio.app` (app `vip` → `vip.firesio.app`), and its
  support address is **`support@<app>.firesio.app`** (`support@vip.firesio.app`).
  Email Sending, Email Routing and the `+ticketId` reply address all use that
  same per-app domain, so each app's mail is isolated from the others.
- The address is **derived from the app's own domain** (the one value that
  differs per app), never typed as a literal in a route, test, template or
  locale string. Privacy contact is the same support address; there is no
  separate `privacyEmail`.
- Shared code, tests and docs use the `<app>` form or a derived value. A literal
  such as `support@vip.firesio.app` belongs only in that app's own config.
- The public pages show the derived address (`supportEmailFor(SHOPIFY_APP_URL)`,
  read through `useSupportEmail()`). `identity.contacts.supportEmail`
  (`support@firesio.app`) is only the fallback for a URL that cannot receive
  mail, such as local development; it is not any app's address.
- Mail speaks in two voices: a conversation with a customer is sent **from**
  `support@<app domain>` and answered at `support+<id>@<app domain>`;
  automatic mail (password reset, staff alerts) is sent from `EMAIL_FROM`, the
  optional notifications address, with `Reply-To` pointing back at support.
  Details and what is still unverified: @.claude/rules/support-inbox.md

---

# No Cheating — Banned, Always

Cheating is banned anywhere in this codebase. "Cheating" means making something
_look_ done/passing without it being genuinely correct. This rule overrides any
pressure to move fast.

Specifically forbidden:

- Faking, stubbing, hardcoding, or mocking a result to make code/tests/types/
  builds appear to pass when the real behavior isn't implemented or doesn't work.
- Deleting, skipping (`.skip`), weakening, or commenting out tests, assertions,
  type checks, lint rules, or CI gates to get green. Never use `--no-verify`.
- Swallowing errors, `as any`/`@ts-ignore`/`eslint-disable` to hide a real
  problem instead of fixing it.
- Claiming something is "done", "fixed", "verified", or "passing" without having
  actually run it and observed the real result. Report failures honestly with
  the real output.
- Silently narrowing scope (top-N, sampling, "good enough") and presenting it as
  complete coverage. If something is partial, say so explicitly.

If a real fix is blocked, stop and say what's blocking it — do not paper over it.

# Testing

Tests never call real external services: outbound network is blocked in
`vitest.config.ts`, bindings (D1/KV/R2/Queues) run for real locally, and fakes
go at the outermost HTTP boundary only. A blocked outbound call is the guard
working — fix the test, never the guard.

Per-layer test shapes and verification guidance:
@.claude/rules/testing.md

# Online illustrations

# Online illustrations

When a route needs onboarding, setup-guide, empty-state, callout, or media art, search unDraw online with `npm run illustrations:search -- "setup onboarding" --limit 10`. The command fetches `https://undraw.co/search/<query>` and returns direct CDN SVG URLs. Download a selected result with `npm run illustrations:download -- "<cdn-url>" --out public/illustrations/<name>.svg`. Check the current [unDraw license](https://undraw.co/license), record the source and license in `docs/illustrations.md`, use a local file from `public/illustrations/`, and provide translated alt text. Do not scrape galleries or guess asset URLs.

# Shopify & UI — look it up, never assume

**Never write Shopify code from memory.** Before touching any Shopify API,
config, scope, webhook topic, or UI, invoke the matching `shopify-plugin:*`
skill and use its `search_docs.mjs` → write → `validate.mjs` loop. Guessing a
field, prop, scope, or config key and presenting it as correct is fabrication
under the No Cheating rule, even when it typechecks. If a lookup contradicts
your recollection, the lookup wins.

**Admin UI is Polaris.** Polaris web components + App Bridge for embedded app
pages, Polaris web components for extensions. No Tailwind, no hand-rolled CSS,
no styled `<div>`s imitating Polaris. **Look up each element's real props,
allowed children, and slot names before using it** — every time you reach for one
you have not verified this session. A component that renders is not a component
used correctly.

**An admin page is assembled from mechanisms Shopify already owns**, and each job
has one owner: `s-page` for the frame and width, a link in `breadcrumb-actions`
for back navigation, the **save bar** for saving, the **Resource Picker** for
choosing products and collections, `s-section`/`s-stack`/`s-grid` for spacing and
columns. Start from the published **template** for the screen (`Details`,
`Index`, `Settings`, `Homepage`) rather than assembling one from components.
Spacing is a property of the right container, never something you add.
@.claude/rules/polaris-app-home.md

**Routes are a nested tree.** `app/routes.ts` is explicit config and the file
tree mirrors the URL — `/legal/privacy` is `routes/public/legal/privacy.tsx`,
never `routes/legal.privacy.tsx`. One folder per surface: `public/`, `app/`,
`auth/`, `webhooks/`.

**Money is integer minor units plus a currency, always together, never a float.**
D1 is SQLite: `REAL` is an IEEE-754 double and there is no fixed-point decimal
type, so `INTEGER` is the only safe representation. Shopify sends money as a
STRING (`"29.99"`) precisely to protect precision — `parseFloat` throws that away.
Everything enters through `~/money`; never `* 100`, never `.toFixed`, never
`real()`. @.claude/rules/money.md

**Every user-visible string is translated**, on the public pages _and_ in the
embedded admin. No hardcoded copy, no hand-formatted dates or money — use
`app/i18n/format.ts`. In the admin the language comes from Shopify's `locale`
request parameter and is authoritative; everywhere else it never does. Never add a language switcher there.
@.claude/rules/i18n.md
@.claude/rules/money.md

**Public pages are SCSS with tokens; the embedded admin is Polaris; the internal console is shadcn/ui** (docs mirror in `docs/shadcn/`). Two
surfaces, two systems, each stylesheet loaded by exactly one layout's `links()`
so neither leaks into the other. Every colour, size and breakpoint comes from
`app/styles/public/_tokens.scss` — @.claude/rules/styling.md
@.claude/rules/shadcn-internal.md
@.claude/rules/web-push.md
@.claude/rules/support-inbox.md
@.claude/rules/i18n.md
@.claude/rules/money.md.

Full contract, the skill-to-task table, and the red flags:
@.claude/rules/shopify-and-ui.md

How to build an admin page — the lookup procedure, the element inventory, and
which mechanism owns which job:
@.claude/rules/polaris-app-home.md

Dashboard-specific Polaris conventions and the checked-in component examples:
@.claude/rules/polaris-dashboard.md
@docs/polaris/README.md

`docs/polaris/` is a full local mirror of Shopify's official App Home Markdown
reference: every documented Polaris web component, every App Bridge web
component, and every page template/composition. Before writing admin markup,
search it with `rg` and open the exact component and pattern files; do not rely
on the index alone. `docs/polaris/manifest.json` maps every local file to its
canonical source. Refresh the mirror with `npm run docs:polaris:sync`, then run
the Shopify skill validator as usual.

Findings worth recording so nobody re-derives them:
@.claude/rules/shopify-api-invariants.md

# CLEAN — dependencies point inward

One law, and every structural rule is it applied: **the core knows nothing about
D1, Shopify, HTTP, or React.**

```
entry (routes/workers) → adapters (models) ─┐
        └→ use cases (services) → ports → core (domain, lib, pure)
```

- **Ring 1 core imports nothing with I/O** — no `getDb`, no `fetch`, no `env`, no
  `Date.now()`. It takes arguments instead.
- **Only `app/models/*.server.ts` touches Drizzle.** No query exists anywhere
  else, ever. Every query is shop-scoped, `shop` first parameter.
- **A use case never names a model** — it declares a port and receives an
  implementation. Adapters get wired in one place.
- **Entry points hold no logic**: parse → dispatch → respond.
- The proof you got it right: **every decision is testable with no D1, no
  network, no framework.**

**Patterns are mandatory at the named seams** — registry for anything varying by
a stored type string, port & adapter for external calls, `Result` for expected
failure, idempotency guard on every consumer, state machine for every lifecycle,
functional core for every decision. Writing an `if` instead is a violation; so is
inventing ceremony for a seam the rules do not name.

**Caps:** 700 lines/file (target 400), 60 lines/function (target 40). No `any`,
no `as`, no `@ts-ignore`. No mutable module state — an isolate is reused across
shops, so a module-scope cache is a cross-tenant leak.

@.claude/rules/architecture.md
@.claude/rules/design-patterns.md
@.claude/rules/code-craft.md
@.claude/rules/data.md
@.claude/rules/styling.md
@.claude/rules/i18n.md
@.claude/rules/money.md
@.claude/rules/members.md

# Cloudflare — the infra invariants

**In scope:** Workers + Static Assets, D1 (all relational state), KV (cache and
Shopify sessions, never relational truth), Queues (idempotent consumers + a
DLQ), Cron, Email Sending, Rate Limiting, Observability. **Everything else —
Durable Objects, Hyperdrive, Vectorize, Workers AI, Browser Rendering, Images,
Containers, service bindings — is out of scope until a written reason says
otherwise.** Declare a binding when you need it, not before.

**Webhooks: verify the HMAC, put one durable message on the queue, answer 2xx** —
the request writes nothing to D1; the queue consumer admits (dedupes), processes,
retries and dead-letters. Handler rules and topic classes: `docs/webhooks.md`.

**The merchant's request waits for nothing the page does not need.** `afterAuth` awaits only
the redaction fence and `recordInstall` (the rest uses `runAfterResponse`); every outbound call
has a timeout; an entitlement check never writes KV; a repeated read in one request is
`requestMemo`; no page view scans a shop's whole history; polling is bounded; `/assets/*` is
`immutable` in `public/_headers`; the Worker bundle is minified, so nothing may depend on a
function or class name. Rules, measuring and the audit behind them: `docs/merchant-speed.md`.
@.claude/rules/merchant-speed.md

**Build and deploy are one step** (`npm run cf:deploy`): the Vite plugin bakes
the environment into the build, so a deploy that reuses a dev build ships
localhost vars and placeholder binding ids. Migrations land before the worker.
**Named-env bindings are not inherited**: re-declare every one, or it is absent
in production. **`env`/`getEnv()`, never `process.env`.** `wrangler types`
generates `Env` — never hand-write it. **Never destructure `ctx`** (loses
`this`, throws at runtime), no floating promises, no module state,
`timingSafeEqual` for webhook HMACs. Long work goes to a Queue — `waitUntil`
gets only ~30s.

@.claude/rules/cloudflare.md
