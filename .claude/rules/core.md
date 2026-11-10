---
paths:
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "workers/**"
  - "extensions/**/*.{ts,tsx}"
---

# Core rules: architecture, code craft, patterns

One law: **dependencies point inward.** The core knows nothing about D1, Shopify, HTTP or React. Every rule below is that law at a different scale.

What the tooling enforces for you (do not lean on it for the rest): ESLint blocks `process`, importing `~/models/**` outside the wiring, `any` and floating promises; `scripts/drizzle-only.test.mjs` blocks raw SQL; `tsc` blocks missing registry entries. **Ring purity, `as`, file and function caps, naming and patterns are on you.**

## The rings

| # | Ring | Lives in | Holds | May import |
|---|---|---|---|---|
| 1 | **Core** (pure) | `app/domain/`, `app/lib/` | Types, money, decisions, state transitions | 1 |
| 2 | **Ports** | `app/ports/` | Interfaces use cases need: repositories, `ShopifyAdmin`, `Clock`, `Ids`, `Mailer`, `Queue` | 1 |
| 3 | **Use cases** | `app/services/` | Orchestration of pure decisions + ports, one file per use case | 1, 2 |
| 4 | **Adapters** | `app/models/`, `app/adapters/` | Drizzle, GraphQL, email, queue: implementations of ring 2 | 1, 2 |
| 5 | **Entry** | `app/routes/`, `workers/`, `extensions/` | Parse input → build deps → call one use case → shape output | 1–4 |

Illegal edges (defects, not preferences):

- Ring 1 imports nothing with I/O: no `getDb`, `fetch`, `env`, `Date.now()`, `crypto.randomUUID()`. Time, randomness, ids and env are **parameters**.
- Ring 3 never imports ring 4 (a use case declares a port and receives an implementation). Ring 4 never imports ring 3 (adapters hold no decisions).
- Only `app/models/*.server.ts` touches Drizzle or `getDb()`. Every query is shop-scoped (`@rules/data.md`).
- Entry points hold no logic. Adapters are wired to ports in one place, the composition root `app/wiring.server.ts` (+ `app/wiring/`); nothing else constructs an adapter.
- Proof you got it right: every decision is testable with no D1, no network and no framework. If a test needs them, the decision is in the wrong ring.

## Boundaries and shape

- A folder exposes a same-named facade (`services/billing.server.ts` re-exports `services/billing/`); callers import the facade.
- **No mutable module state**: an isolate is reused across shops, so a module-scope cache or `let` is a cross-tenant leak. Per-request state lives in the request context; caches in KV under a shop-scoped key. No singletons, no service locators, no inheritance for reuse; pass dependencies as one object.
- Dead code is deleted, not commented out. No exported symbol without a caller. There is no `app/utils/`: pure helpers go to `app/lib/<topic>.ts`.
- Tests sit beside their subject (`*.test.ts`); shared helpers in `app/test/`. Zod schemas (edge parsing only) in `app/schemas/`. `app/components/` is presentational: props in, JSX out.
- **Caps: 700 lines per file (target 400), 60 per function (target 40).** Run `wc -l` on what you grew. Splitting or moving is a pure move (output-identical, tests green before and after); never mix it with a fix. Exempt: generated files, migration SQL, tests.
- Tables without a `shop` column are exactly `admin_users` (our staff) and `redacted_shops` (the redaction tombstone: hash + timestamp; no `shop` column is also what keeps the purge guard from deleting it). Neither is a precedent.

## Routes are a nested tree

`app/routes.ts` is explicit config; flat file-name routing (`flatRoutes`) is a regression. The file tree mirrors the URL: `/legal/privacy` → `routes/public/legal/privacy.tsx`, never `routes/legal.privacy.tsx`.

- One folder per surface: `public/` · `app/` (embedded admin) · `internal/` (staff console) · `auth/` · `webhooks/` · `resources/` (action-only endpoints). A route fitting none is a new surface: add a group in `routes.ts` and a folder.
- A path segment is a directory (`/webhooks/app/uninstalled` → `webhooks/app/uninstalled.tsx`).
- `_layout.tsx` is the shell for its folder and the only thing that loads that surface's stylesheet or runs its shared auth check.
- Route-local helpers sit beside the route, suffixed (`auth/login.tsx` + `auth/login-error.server.ts`). Never re-export a route from a barrel; `routes.ts` is the only index. A route entry and its file are one change.

## Types

- No `any`, no `as`, no `@ts-ignore`, no non-null `!`. If types resist, the design is wrong.
- Brand every id and amount (`ShopDomain`, `OrderId`, `MinorUnits`, `CurrencyCode`). Money is integer minor units + currency, always together (`@rules/money.md`).
- Unions over booleans + optionals: a status is `"pending" | "active" | "cancelled"`. Switch exhaustively with a `never` fallthrough.
- Derive types (from the Zod schema or the Drizzle table); never hand-write a parallel interface.

## Parse at the edge, fail as a value

- Every external input (form, webhook body, query, GraphQL response, env) is parsed by a Zod schema at ring 5; inward, values are valid, with no defensive `if (!x) return`. Persist only through an explicit allowlist of fields.
- Expected failures return `Result<T, E>` (`app/lib/result.ts`). `throw` is for programmer error and broken invariants. Never `catch {}`: a caught error is recorded, logged and returned as a reason, or re-thrown. Never return a success shape for an effect that did not happen.
- Every degraded path and failed side effect logs a structured event with a stable name and the shop. Never log secrets, tokens or customer PII.

## Functions, names, immutability

- Split a function when you need "and" to describe it, it mixes parse + decide + I/O, nesting exceeds 2, it has more than 3 branches choosing different outcomes (that is a registry), or a block needs a "this part does X" comment.
- An orchestrator reads as named steps and never inlines a step's body. Derive a value once and pass it down. A `.map()` callback is a thin projection.
- Build response objects explicitly; never spread a DB row into a response, never spread-then-strip. More than ~4 positional params → one options object. No speculative parameters.
- One word per concept, identical across DB column, model, use case, schema, payload and UI label (the table says `shop`, so nothing downstream says `storeDomain`). Functions are verbs. Banned suffixes: `Manager`, `Helper`, `Util`, `Data`, `Info`, and `Service` on anything but a ring-3 use case. Booleans read as predicates.
- Inputs are `readonly`; never mutate a parameter or a shared object; return new values.

## Patterns: mandatory at the named seams, forbidden elsewhere

No abstract base class for one implementation, no interface with one caller, no factory returning one thing, no event bus for a direct call. Invented ceremony is as much a violation as a missing pattern.

| Situation | Required pattern |
|---|---|
| Reading or writing D1 | **Repository**: `app/models/*.server.ts`, shop-scoped |
| Behaviour varies by a stored type string (webhook topics, form intents, rule kinds, plan tiers) | **Strategy + Registry** (below) |
| Calling Shopify, email, queue, clock, ids | **Port & Adapter**: narrow interface in `app/ports/`, adapter in `app/adapters/`, fake in `app/test/` |
| Expected, non-exceptional failure | **Result**: `{ ok: false, reason }` |
| A route action with several intents | **Command dispatch**: `Record<Intent, Handler>`, the action is a thin `dispatch()` |
| A webhook or queue consumer | **Idempotency guard**: stable key, claim it, return early, before any side effect. For a webhook the claim is the consumer's admission step (`admitWebhook`), never the HTTP request |
| A side effect of a handler (mail, push, any notice) | **Enqueue with a deterministic dedupe key** built from the delivery or event, never random: the handler runs again on retry |
| A record with a lifecycle (`status` column) | **State machine**: transitions declared as data, one `transition()` funnel, illegal ones rejected |
| Any business decision | **Functional core**: a pure function; the shell only awaits I/O and calls it |
| A cached read | **KV under a shop-scoped key**, invalidated at the write site |
| Test setup | **Factory**: `app/test/factories.ts` |

**The registry**: each handler is pure in its own file; one static literal map keyed by a **union type** (`Record<WebhookTopic, TopicHandler>`, never `Record<string, …>`), so the build fails when a variant has no handler. Unknown keys are handled explicitly (stored data outlives code; a retired type must degrade, never throw). No runtime `register()` calls. **Adding a variant touches one new file, one map entry, one test**; if you also edit the dispatcher, you applied it wrong.

Before you finish, answer: **where does the next variant go?** If the answer is "edit this function", make it a registry now.
