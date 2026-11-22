# Upgrading

Two things move an app: a newer TEMPLATE tag (merge it, below) and the routine upgrades every Worker needs (the last section).
Each says what it affects and gives a checklist you can follow mechanically. The history of the template before step 13 (the
hand-written wiring, the adapters, the entitlement service) is in git (`git log -- docs/UPGRADING.md`); none of it applies to
a template that is the preset plus one config file.

> The template ships one workflow, `.github/workflows/verify.yml` (`npm run verify` and a production build). It runs only on a pull request that touches code, on a `template-v*` tag (a derived app picks its own pattern) or by hand; there is no Dependabot. Deploys come from Cloudflare Workers Builds and run no CI, and the pre-commit hook (`.githooks/pre-commit`) is the local gate.

---

## template-v1.0.0: the minimal app on `@firesio/app` (roadmap step 13, ticket 17)

A NEW BASELINE, not an increment. An app built on the earlier template does not merge this tag: it moves one feature at a time onto the
libraries (roadmap step 14, repair first), keeping its tables (the libraries' schemas keep the template's table and column names, so most need no
migration) and its own business rules. A NEW app starts here with `npm run new-app`.

Taking a LATER tag into an app that started here: merge it; the `template` files in `template-files.json` come over unchanged, the `app` files are yours;
read the tag's entry in `CHANGELOG.md` for anything to do besides the merge (a schema addition is a new migration you generate with `npm run db:generate`;
a package bump is `npm install @firesio/app@<range>`). Run `npm run verify` before and after.

What this tag removed from the earlier template, and where it went: money, billing and entitlements, notifications and Web Push, support, members, the text
units, AI, the webhook inbox, the GDPR purge, the Admin client, the guard, the Worker's handlers and the AdminApi are `@firesio/app` (the preset at its root, one subpath per library); the staff console, MCP, campaigns and the `api/v1` routes are the portal's
job (or gone); the Partner-history sweep, the uninstall probe and the scope log were not carried (see the report that came with step 13; the uninstall probe has since come back as a step of the preset's hourly cron).

---

## Routine upgrades (any app on this template)

**Admin API / webhook version.** ONE decision: the package's default (`ADMIN_API_VERSION` of `@firesio/app/shell`, `2026-10`, which
`createFiresio({ shopify: { apiVersion } })` follows unless the app chooses another) and `api_version` in `[webhooks]` of BOTH
`shopify.app.toml` and `shopify.app.dev.toml`. A newer package moves the first; change the two tomls in the same commit;
`npm run check:placeholders` refuses a mismatch (it reads the package's file). Before moving, read the release notes of the new version in full (shopify.dev
changelog) and validate every Admin operation of the app against it with the Shopify skill's `validate.mjs`; record what you
read in `docs/shopify-api-invariants.md`. Production apps: deploy the Worker first, then `shopify app deploy`, in separate commits
from any queue, cron, secret or migration change.

**`@firesio/app` and `@firesio/portal-contract`.** `npm install @firesio/app@<range> @firesio/portal-contract@<range>` with
`NPM_TOKEN` in the environment (never in a file), then `npm run verify`. Before 1.0 a minor version may break: read the release's
entry in the package's CHANGELOG (`packages/app/CHANGELOG.md` in the Firesio platform repo; the installed package carries its
READMEs, not its CHANGELOG) and this template's `CHANGELOG.md`, which says what an app on the template does. A library that gained
a table or a column makes `tools/architecture/schema-drift.test.ts` fail until `npm run db:generate` writes the migration (read the
SQL: the app owns its migrations, and its database holds rows); `drizzle-kit generate` must then report no changes. When a library
RENAMED a table, drizzle-kit asks whether the new one is "created or renamed": answer renamed, so the migration is
`ALTER TABLE ... RENAME TO` and the rows stay (a drop and a create would lose them), and add a case to
`tools/architecture/migration-rows.test.ts`. The preset's README (`node_modules/@firesio/app/src/preset/README.md`)
lists every option and binding; a new required binding goes in `wrangler.jsonc` at the top level AND `env.production`.

**Cloudflare: wrangler and `compatibility_date`.** `npx wrangler types` after any `wrangler.jsonc` change (`npm run verify`
fails on a stale `worker-configuration.d.ts` through `wrangler types --check`). Do NOT raise `compatibility_date` to 2026-11-17 or
later without testing: the new module registry becomes the default. `nodejs_compat` stays listed even where it is already the default.

**Node.** Develop on Node 24 or 26 (`engines` is `>=24.15`). `.nvmrc` stays `24` on purpose: it also selects the Node version of
Cloudflare Workers Builds (the build that migrates and deploys), whose default is Node 24. Change `.nvmrc` and the README's `Runtime`
row together only after a Workers Builds run on the newer Node.

**TypeScript** stays on 6.0.x while `typescript-eslint` declares `typescript <6.1.0`.

**The admin bundle budget** (`scripts/bundle-budget.mjs`, run by `npm run build`): never raise it to make a build pass. A package bump that fails it has put something in every page: find which chunk grew (`react-router build --sourcemapClient`, sum the sources per chunk), fix the cause in the app or report the package-side gap (entry, size, what to split). 2.0.0 -> 2.1.1 went 227 KB -> 167 KB this way.

**Moving from 1.x to 2.x** is `docs/migrating-to-2.0.md`.

**Every upgrade ends with**

```bash
npm run verify                                   # cf-typegen:check, typecheck, lint, every test
CLOUDFLARE_ENV=production npx react-router build
npx drizzle-kit generate                         # "No schema changes"
npm audit --omit=dev
```
