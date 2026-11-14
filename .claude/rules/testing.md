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

Pure code is unit-tested exhaustively; anything crossing a boundary gets an integration test against **real local bindings**. A test that touches a binding (or a route, or the wiring) runs in workerd (`vitest.config.ts` decides by what it imports); a pure one runs in Node.

| Layer | Test shape |
|---|---|
| **core** (`app/core/`) | No I/O: exhaustive unit tests, every branch, every variant, the unknown one. Use cases that need a port are tested with the real D1 adapter through `createServices(env)`: the library's doubles prove the libraries, these tests prove the wiring. |
| **adapters** (`app/adapters/`) | Integration against real local D1/KV/R2. Every query shop-scoped, and **a test proving it cannot read another shop's row is required**. |
| **Webhook and queue consumers** | Integration, with a **duplicate-delivery test proving exactly one effect** (`core/webhooks/consume.test.ts`). The receiver is tested for what reached the queue and that **no D1 row was written in the request** (`routes/webhooks/receive.test.ts`). |
| **Cron** | `core/scheduled.test.ts`: which steps run on which cron string, and that one failing step costs the others nothing. |
| **Library pages** (`@firesio/app-ui`) | Tested in the library (loaders and actions against the real services). Here: the wiring of their deps (`wiring/app-ui.ts`) and the guard. Polaris web components are verified by hand; say so honestly. |
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
  `app/test/`.

## Speed, and what it costs

The Workers project runs with `isolate: false`: files share one workerd runtime,
so the dependency graph is imported once instead of once per file (the full
suite went from ~165s to ~95s). Tests boot `app/test/worker-entry.ts`, a stub,
not `workers/app.ts`, which would load the whole app into every runtime.

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
