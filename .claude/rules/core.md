---
paths:
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "workers/**"
  - "tools/**"
---

# Core rules: layers, code craft

One law: **dependencies point inward.** The table is `eslint.boundaries.js`; `tools/architecture/boundaries.test.ts` proves it refuses what it should. A new top-level folder under `app/` fails lint (`no-unknown-files`) until it has a row.

The folders, what each holds, what each may import and where a growing feature's files go: `CLAUDE.md`, "Layout". In short, per feature:
`app/core/<feature>/` (types, rules, ports, use cases: pure) -> `app/adapters/<feature>/` (the ports over D1, KV, R2, Shopify, HTTP)
-> `app/wiring/<feature>.ts` (bound for a shop, plus the feature's handlers) -> `app/firesio.server.ts` (the `services` factory, `jobs`, `flows`, `on`, `webhooks`,
`queues`, `cron`) -> `app/routes/app/<feature>/` (thin) with `app/components/<feature>/` and `app/i18n/`; the tables in `app/db/`.

- core takes time, ids, randomness and secrets as arguments: lint bans `Date.now`, `new Date()`, `Math.random`, `crypto.randomUUID` outside tests (the preset's runtime reads them; a Date made from a value, `new Date(ms)`, is fine) and bans `fetch` and React in core.
- A use case of the app's own (in `app/core/<feature>/`) declares a port and is handed an adapter (`app/adapters/<feature>/`) by its wiring; entry points hold no logic and a route never queries a table. The adapters of the shared tables are the preset's. The plan catalogue is the example: `core/plans.ts` declares `PlanCounts` (what its usage meters count) and `app/firesio.server.ts` passes the preset's count, so core never imports the composition file (the import cycle the preset's README calls harmless is refused by the layer table here).
- Dates: every boundary that decides something (a quota's day or month, the end of a cancellation's day) is UTC, with the helpers of `@firesio/app/core` (`startOfUtcDay`, `startOfUtcMonth`, ...). A shop's time zone only formats what a person reads (`Intl`).
- The libraries are packages: import their public entries (`@firesio/app`, `@firesio/app/plans`, `/d1`, `/testing`, ...), never their `src` paths (`drizzle.config.ts` takes the schema paths from `firesioSchemaPaths()`, `@firesio/app/preset/schema`). A rule or a feature that two apps need goes to the library (platform repo), not here.
- **No mutable module state**: an isolate is reused across shops. The preset's caches (`firesio.services`, `firesio.shopify`) are `WeakMap`s keyed by `env`, holding nothing about a shop; the app adds none.
- Dead code is deleted. Tests sit beside their subject (`*.test.ts`); shared helpers in `app/test/`.
- **Caps (lint): a file at most 400 lines, a function at most 40** (blank lines and comments not counted). A `describe` callback is a function: split it.
- No `any`, no `as`, no `@ts-ignore`, no non-null `!`. Narrow with a type guard or a zod parse. If types resist, the design is wrong.
- Unions over booleans and optionals; switch exhaustively. Derive types from the schema or the table.
- Parse every external input (form, webhook body, query, GraphQL response) at the edge; inward, values are valid.
- Event ids, the outbox and the portal: see `CLAUDE.md`. A new event type is added to the contract in the platform repo first.

## Routes

`app/routes.ts` is explicit config; the file tree mirrors the URL. One folder per surface: `public/`, `app/` (embedded admin), `auth/`, `webhooks/`. The merchant pages of `@firesio/app` are two-line files under `routes/app/` that re-export a library route module (`export { default, loader, action } from "@firesio/app/ui/support/thread"`); the layout's `middleware = [firesio.adminMiddleware]` authenticates, admits the member and hands them their deps. A loader or action of the app's own is `firesio.loader(permission, handler)` / `firesio.action(...)` (the long form: `firesio.from(context)` and `firesio.requirePermission(member, "...")`), and reaches the app's own services from the same bag (the `services` factory). One folder per feature under `routes/app/` (`routes/app/orders/list.tsx`), a resource route (no page) is a `.ts` file. To change a page, extend the library, do not copy it out.
