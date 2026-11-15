---
paths:
  - "**/*.test.{ts,tsx,mjs}"
  - "app/test/**"
  - "vitest.config.ts"
---

# Testing

Use evidence before claiming anything is done, fixed, or passing, and isolate the
root cause before changing code for a bug or test failure.

## Test shape by layer

Pure code is unit-tested exhaustively; anything crossing a boundary gets an integration test against **real local bindings**. A test that touches a binding (or a route, or `firesio.server.ts`) runs in workerd; a pure one runs in Node. WHICH is the file name, never what it imports (`vitest.config.ts`): `*.e2e.test.ts` boots the real Worker, `*.workerd.test.ts` (and any test under `app/routes/` or `workers/`) runs in workerd and imports the code directly, every other `*.test.ts` runs in Node (the config refuses a Node test that imports `cloudflare:*` and says which name to give it).

| Layer | Test shape |
|---|---|
| **core** (`app/core/`) | No I/O: exhaustive unit tests, every branch, every variant, the unknown one. Code that needs a port is tested with the real services through `firesio.services(env)`: the preset's own tests prove the preset, these tests prove the app's configuration of it (`app/firesio.server.test.ts`). |
| **the app's own tables and queries** (`app/db/`) | Integration against real local D1/KV/R2. Every query shop-scoped, and **a test proving it cannot read another shop's row is required**. |
| **Webhook and queue consumers** | The consumer, the duplicate-delivery test and the GDPR purge are the preset's (tested in the platform repo). Here: the receiver hands the RAW request to `firesio.webhook(request)` and never the result of `authenticate.webhook` (a failed session refresh would be a 500; `routes/webhooks/receive.test.ts`: a bad signature is a 401 for any topic, a good one for a topic nobody handles is a 200 with nothing queued), `workers/webhooks.e2e.test.ts` runs a signed `app/uninstalled` and `shop/redact` from the HTTP request through the real Worker's `fetch` and `queue` to the D1 effect, and a redelivery changes nothing; and a topic of the app's own (a key of the `webhooks` option) has a test of its own with a **duplicate-delivery test proving exactly one effect**. |
| **Cron and the Worker's handlers** | `workers/scheduled.e2e.test.ts` calls the real entry's `scheduled` with each cron `wrangler.jsonc` declares (`30 3 * * *`, `* * * * *`, `*/5 * * * *`) and asserts what reached `PORTAL_EVENTS` (the one place cron behaviour is tested); a batch for an unknown queue is retried, never acknowledged (`workers/webhooks.e2e.test.ts`). |
| **Public routes and error pages** | `workers/routes.e2e.test.ts`, through `exports.default.fetch`: a malformed `host` on `/auth/*` is a 400, `/?shop=` redirects to `/app`, the support form (decoy field, invalid input, a body over 64 KB is a 413), `/app` with no shop goes to `/`, an unknown address is the root's 404 page, and every response carries the security headers. `app/routes/app/layout.test.tsx` renders the /app boundary for a blocked shop, a forbidden page and App Bridge's token page. |
| **Schema and migrations** | `tools/architecture/schema-drift.test.ts`: every table of every schema file in `drizzle.config.ts` has a `CREATE TABLE` in `drizzle/*.sql`, and no migrated table is undeclared. |
| **The AdminApi (what the portal calls)** | `workers/admin-api.e2e.test.ts`: `env.PORTAL_ADMIN_API`, a test-only service binding to this Worker's `AdminApi` entrypoint, called over RPC through the contract's `callCommand` exactly as the portal does (`shops`, `billing`, `support`, plan gifts). |
| **Library pages** (`@firesio/app/ui/*`) | Tested in the library (loaders and actions against the real services). Here: the middleware that wires their deps (`firesio.adminMiddleware`, tested in the preset) and, for a loader of the app's own, its permission. Polaris web components are verified by hand; say so honestly. |
| **Config** | `scripts/wrangler-bindings.test.mjs` (top level equals `env.production`), `scripts/template-manifest.test.mjs`, `scripts/check-placeholders.test.mjs`, `app/core/config.test.ts`. |
| **Architecture** | `tools/architecture/boundaries.test.ts` probes the layers and the bans with real files. |

## A test must NEVER call a real external service

Not a style preference — this has really happened. A suite that inherited live
email credentials quietly mailed a non-existent address for weeks: hundreds of
sends, an 86% bounce rate inside 24 hours, the sending domain's reputation
degraded and its daily quota exhausted. **Every test was green the whole time.**
Green is not proof of harmlessness.

So, in this repo:

- **Outbound network is blocked in `vitest.config.ts`** via the pool's
  `outboundService`, and third-party credentials are blanked or faked in the test
  env. A blocked-outbound error is **the guard working** — the fix is a fake at
  the outermost HTTP boundary, never an exception to the guard.
- Bindings — **D1, KV, R2, Queues** — are local emulations. Use them for real;
  that is the point of the Workers pool. Only the public internet is closed.
- If a test ever needs a recipient address, use a domain you own. Never
  `@example.com`, `.test`, `.invalid`, or `.localhost` (RFC-2606 reserved → hard
  bounce), and never a stranger's real inbox.
- A blocked call shows up as a 403 whose body says so: read it before changing anything.

## Real behavior, not mocks

- Mock **only the outermost external HTTP boundary** — Shopify Admin GraphQL,
  the Partner API, email. Everything below it (D1, KV, Queues, your own decisions and arithmetic)
  runs for real.
- **Never mock a model or service to assert call-args.** A test whose only
  assertion is `expect(mock).toHaveBeenCalledWith(...)` tests the
  implementation: it fails on a correct refactor and passes when the behavior
  breaks. Assert resulting **DB state** instead.
- UI assertions must connect values to their semantic label, accessible name,
  or containing region. A global substring match for a number can pass when the
  intended metric is wrong because the same digits appear elsewhere in markup.
- Forbidden: a test that fails only when you remove a mock; a partial mock
  missing fields the real API returns; test-only methods added to production
  code (helpers live in `app/test/`).
- Hard to test → the design is wrong, not the rule. Must mock everything → too
  coupled; inject dependencies. Huge setup → extract factories into
  `app/test/`. `installShop` (a shop installed the way `afterAuth` records it), `recordSends`, `tick` and `deliver` live in
  `app/test/e2e.ts`: one copy, never a second one in a test file.

## Speed, and what it costs

The Workers project runs with `isolate: false`: files share one workerd runtime,
so the dependency graph is imported once instead of once per file (the full
suite went from ~165s to ~95s). The `workers` project boots `app/test/worker-entry.ts`, a stub,
not `workers/app.ts`, which would load the whole app into every runtime.

The **`e2e` project** (`workers/*.e2e.test.ts`) is the exception on purpose: it boots the REAL `workers/app.ts`, so a test calls it the way
Cloudflare does: `exports.default.fetch(request)`, `exports.default.scheduled(...)`, `exports.default.queue(batch)` and the `AdminApi`
entrypoint through `env.PORTAL_ADMIN_API`. Only the React Router manifest is narrowed (`app/test/server-build.ts` stands in for
`virtual:react-router/server-build` with the real route modules it lists: the webhook receiver, `/healthz`, the landing and support pages, `/auth/*` and the /app layout and home; add a route there when a test needs it). Things to know, found the hard way:
- `exports.default.queue(name, messages)` is NOT workerd's `Fetcher.queue` here: the plugin serves it as an RPC method and the handler receives
  the name string as its batch. `deliver()` in `app/test/e2e.ts` passes a batch-shaped object whose `ack()`/`retry()` call back into the test.
- Miniflare delivers a message of a queue with a consumer in `wrangler.jsonc` to the Worker's `queue` handler about 5 seconds after it is sent,
  on its own clock. `recordSends(env.WEBHOOK_QUEUE)` therefore CAPTURES what the Worker sent (it does not forward it) and the test hands the body
  to `deliver()` itself: the delivery happens exactly when and as often as the test says. Restore with `afterEach(() => vi.restoreAllMocks())`.
- Calling a group the entrypoint does not define (`campaigns`) over the binding makes the plugin print an uncaught exception of its own; assert the
  entrypoint's methods instead.

The trade-off is that **KV, R2 and in-memory binding state is not reset between
files**. A test must not rely on, or be broken by, another file's leftovers: use
unique keys per test, reset D1 with `setupTestDatabase()` (one batched delete per
test), and keep module-level mutable state out of production code (already
banned). Run `npx vitest run --sequence.shuffle.files` after adding a test that
touches KV, R2 or a rate limiter. For the inner loop, `npm run test:quick` runs
only the tests affected by uncommitted changes.

## Before claiming done

Run it and read the output. Then say what you ran.

```bash
npx vitest related --run <changed files>
npm run verify                      # typecheck + lint + full suite
```

`related` is a **subcommand, not a flag** — `--related` was removed in Vitest 4
and dies with `CACError` before a single test runs. Run the **full** suite
(`npm run verify`) when the change touches `app/db/`, `drizzle/`, money, a
webhook handler, the Shopify seam, or any build config — a migration breaks tests
that never mention it.

Never `--no-verify`. Never `.skip` a test to move on. Never weaken an assertion,
delete a check, or narrow scope silently to reach green.

### Checklist

- [ ] All relevant tests pass; output pristine
- [ ] Real code exercised; mocks only at the external HTTP boundary
- [ ] Edge cases: zero, negative, boundary, missing data, duplicate/replay, unauthorized
- [ ] Ran the commands above and reported the real result
