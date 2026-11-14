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
| core | `app/core/` | Decisions, ports, catalogues (`PLANS`, `MEMBERS`, ...), use cases | core |
| adapters | `app/adapters/` | D1, KV, R2, Shopify, Turnstile: implementations of core's ports | core, adapters |
| wiring | `app/wiring/` | Composition root: picks adapters, reads the clock, mints ids | adapters, core, i18n |
| components | `app/components/` | Presentational React (props in, JSX out) | core, i18n |
| i18n | `app/i18n/` | Language of a request, the label objects `@firesio/app-ui` takes | core |
| routes | `app/routes/` | Read input, call a use case or a library route module, return | wiring, components, i18n, core |
| entry | `root.tsx`, `routes.ts`, `entry.*` | Document and route table | routes, wiring, components, i18n, core |
| workers | `workers/` | `fetch`, `scheduled`, `queue`, `email`, `AdminApi`: build services, hand over | wiring, core |

- core takes time, ids, randomness and secrets as arguments: lint bans `Date.now`, `new Date()`, `Math.random`, `crypto.randomUUID` outside `app/wiring` (a Date made from a value, `new Date(ms)`, is fine) and bans `fetch` and React in core.
- A use case declares a port (`ShopsPort`, `MetricsPort`) and receives an adapter; the adapter turns database errors into values where the caller must not fail. Entry points hold no logic.
- The libraries are packages: import their public entries (`@firesio/x`, `/d1`, `/testing`), never their `src` paths. A rule or a feature that two apps need goes to the library (platform repo), not here.
- **No mutable module state**: an isolate is reused across shops. The one cache (`shopify()` in `wiring/shopify.ts`) is a `WeakMap` keyed by `env`, holding nothing about a shop.
- Dead code is deleted. Tests sit beside their subject (`*.test.ts`); shared helpers in `app/test/`.
- **Caps (lint): a file at most 400 lines, a function at most 40** (blank lines and comments not counted). A `describe` callback is a function: split it.
- No `any`, no `as`, no `@ts-ignore`, no non-null `!`. Narrow with a type guard or a zod parse. If types resist, the design is wrong.
- Unions over booleans and optionals; switch exhaustively. Derive types from the schema or the table.
- Parse every external input (form, webhook body, query, GraphQL response) at the edge; inward, values are valid.
- Event ids, the outbox and the portal: see `CLAUDE.md`. A new event type is added to the contract in the platform repo first.

## Routes

`app/routes.ts` is explicit config; the file tree mirrors the URL. One folder per surface: `public/`, `app/` (embedded admin), `auth/`, `webhooks/`. The merchant pages of `@firesio/app-ui` are two-line files under `routes/app/` that re-export a library route module (`export { default, loader, action } from "@firesio/app-ui/support/thread"`); the layout's `middleware` hands them their deps (`wiring/app-ui.ts`). To change a page, extend the library, do not copy it out.
