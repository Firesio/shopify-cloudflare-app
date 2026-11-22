# Documentation

Reference material for people and agents. **Nothing here is loaded automatically** by Claude Code: search with `rg`, open the section you need.
What an agent must always follow is in `CLAUDE.md`; per-area rules are in `.claude/rules/` (loaded when matching files are opened); recipes are in `.claude/skills/`.
The design of the platform (events, commands, libraries, the portal) is `docs/architecture.md` in the Firesio platform repo (not carried by a derived app); each library's README is the manual for its feature.

## Starting and running an app

- [New app setup](SETUP.md): the copy-and-start workflow (`npm run new-app`).
- [Adoption checklist](ADOPTING_THE_TEMPLATE.md): product, compliance and release decisions, and what an agent does in a derived app.
- [Legal content template](LEGAL_TEMPLATE.md): required policy inputs.
- [Operations runbook](OPERATIONS.md): deploy, incident (roll back first, then D1 Time Travel), D1 insights, secrets, jobs and dead letters, mail, observability, spend alerts, Issues and Monitors to the portal, R2 lifecycle, previews.
- [Upgrading](UPGRADING.md): taking a newer template tag, and the routine upgrades (Admin API version, packages, wrangler, Node).
- [Migrating an app from `@firesio/app` 1.x to 2.0](migrating-to-2.0.md): the package's changeset as an ordered checklist (code, configuration, expand-only migration, one-shot flows, what to run before deploying).
- `../CHANGELOG.md` and `../template-files.json`: what each template tag changes, and which files are the template's and which the app's.

## How the systems work

- [Receiving Shopify webhooks](webhooks.md): receiver and consumer, handler rules, adding a topic.
- [Merchant speed](merchant-speed.md): what the embedded admin may wait for, and how to measure.
- [Polaris admin guide](polaris-admin-guide.md): page anatomy, toast example, done-checklist.

## Facts

- [Shopify API invariants](shopify-api-invariants.md): verified and still-unverified findings about Shopify and Cloudflare, with the design consequence of each (the `shopify-findings` skill has the index).
