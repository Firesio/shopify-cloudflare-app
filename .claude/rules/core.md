---
paths:
  - "app/**/*.ts"
  - "app/**/*.tsx"
  - "workers/**"
  - "tools/**"
---

# Core rules: layers, code craft

One law: **dependencies point inward.** The table is `eslint.boundaries.js`; `tools/architecture/boundaries.test.ts` proves it refuses what it should. A new top-level folder under `app/` fails lint (`no-unknown-files`) until it has a row.

| Element | Folder | Holds | May import |
|---|---|---|---|
| core | `app/core/` | The app's declarations (`PLANS`, `MEMBERS`, identity) and pure helpers | core |
| db | `app/db/` | The app's own Drizzle tables (the shared ones are `@firesio/app`'s) | db |
| composition | `app/firesio.server.ts` | THE call of `createFiresio`: only what differs from the preset's defaults | core, db, i18n |
| components | `app/components/` | Presentational React (props in, JSX out) | core, i18n |
| i18n | `app/i18n/` | Language of a request, the label objects the `@firesio/app/ui/*` pages take | core |
| routes | `app/routes/` | Read input, call a use case or a library route module, return | composition, components, i18n, core, db |
| entry | `root.tsx`, `routes.ts`, `entry.*` | Document and route table | routes, composition, components, i18n, core |
| workers | `workers/` | `fetch`, then `scheduled`, `queue`, `email`, `AdminApi`: delegate to `firesio` | composition, core |

- core takes time, ids, randomness and secrets as arguments: lint bans `Date.now`, `new Date()`, `Math.random`, `crypto.randomUUID` outside tests (the preset's runtime reads them; a Date made from a value, `new Date(ms)`, is fine) and bans `fetch` and React in core.
- A use case of the app's own declares a port and receives an adapter built from `firesio.services()`; entry points hold no logic. The adapters of the shared tables are the preset's.
- The libraries are packages: import their public entries (`@firesio/app`, `@firesio/app/plans`, `/d1`, `/testing`, ...), never their `src` paths (`drizzle.config.ts` takes the schema paths from `firesioSchemaPaths()`, `@firesio/app/preset/schema`). A rule or a feature that two apps need goes to the library (platform repo), not here.
- **No mutable module state**: an isolate is reused across shops. The preset's caches (`firesio.services`, `firesio.shopify`) are `WeakMap`s keyed by `env`, holding nothing about a shop; the app adds none.
- Dead code is deleted. Tests sit beside their subject (`*.test.ts`); shared helpers in `app/test/`.
- **Caps (lint): a file at most 400 lines, a function at most 40** (blank lines and comments not counted). A `describe` callback is a function: split it.
- No `any`, no `as`, no `@ts-ignore`, no non-null `!`. Narrow with a type guard or a zod parse. If types resist, the design is wrong.
- Unions over booleans and optionals; switch exhaustively. Derive types from the schema or the table.
- Parse every external input (form, webhook body, query, GraphQL response) at the edge; inward, values are valid.
- Event ids, the outbox and the portal: see `CLAUDE.md`. A new event type is added to the contract in the platform repo first.

## Routes

`app/routes.ts` is explicit config; the file tree mirrors the URL. One folder per surface: `public/`, `app/` (embedded admin), `auth/`, `webhooks/`. The merchant pages of `@firesio/app` are two-line files under `routes/app/` that re-export a library route module (`export { default, loader, action } from "@firesio/app/ui/support/thread"`); the layout's `middleware = [firesio.adminMiddleware]` authenticates, admits the member and hands them their deps. A loader of the app's own calls `firesio.from(context)` and `firesio.requirePermission(member, "...")`. To change a page, extend the library, do not copy it out.
