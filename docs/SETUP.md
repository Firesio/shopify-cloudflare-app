# New App Setup

Use this checklist after creating a repository from the template. The template is the minimal app on the `@firesio/app` preset: Shopify auth routes, the embedded shell, the public pages, the catalogues of plans and roles and ONE config file (`app/firesio.server.ts`). The rest is `@firesio/app` and `@firesio/portal-contract` (installed from GitHub Packages with a read-only `NPM_TOKEN`).

## Local development

```bash
export NPM_TOKEN=...                          # read:packages; never written into a file
npm install
npm run new-app -- <slug> "<Display Name>"    # once; renames everything, prints the Cloudflare resources to create
cp .dev.vars.example .dev.vars
npm run config:link:dev
npm run db:migrate:local
npm run dev
```

Fill local secrets in `.dev.vars`; never commit it. Add feature code under `app/core` (decisions and use cases), `app/db` (its tables) and `app/routes` (loaders call `firesio.from(context)`), following the layers (`.claude/rules/core.md`); what the preset can already do (support, members, plans, metrics, content, notifications) is an option of `createFiresio`, not new code.

## App identity

`app/core/identity.ts` (slug, name, legal), `app/core/plans.ts`, `app/i18n/labels.ts`, the webhook queue names in `wrangler.jsonc` (`npm run new-app` renames them with the Worker's resources; the preset derives the queues it consumes from the slug, so `app/firesio.server.ts` names none), and both Shopify TOML files. The slug is the `appSlug` on every
event: register the same slug on the portal's `/apps` page. Keep dev and production apps separate and review the diff after `config:link`.

## Production

Create the resources `new-app` listed, copy their ids into `wrangler.jsonc` under `env.production`, set the secrets with `wrangler secret put`, then:

```bash
npm run cf-typegen
npm run verify
npm run check:placeholders
npm run cf:deploy
```

`check:placeholders` is expected to fail on a fresh clone and is the final gate that confirms app-specific values were replaced. For legal, privacy,
compliance and operational review see `LEGAL_TEMPLATE.md` and `OPERATIONS.md`.
