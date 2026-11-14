# Documentation

Reference material for people and agents. **Nothing here is loaded automatically** by Claude Code: search with `rg`, open the section you need.
What an agent must always follow is in `CLAUDE.md`; per-area rules are in `.claude/rules/` (loaded when matching files are opened); recipes are in `agent-skills/`.
The design of the platform (events, commands, libraries, the portal) is `platform/docs/architecture.md`; each library's README is the manual for its feature.

## Starting and running an app

- [New app setup](SETUP.md): the copy-and-start workflow (`npm run new-app`).
- [Adoption checklist](ADOPTING_THE_TEMPLATE.md): product, compliance and release decisions, and what an agent does in a derived app.
- [Legal content template](LEGAL_TEMPLATE.md): required policy inputs.
- [Operations runbook](OPERATIONS.md): deploy, roll back, D1 backup and recovery, secrets, webhook DLQ replay.
- [Upgrading](UPGRADING.md): taking a newer template tag; moving an app built on the earlier template (roadmap step 14).
- `../CHANGELOG.md` and `../template-files.json`: what each template tag changes, and which files are the template's and which the app's.

## How the systems work

- [Receiving Shopify webhooks](webhooks.md): receiver and consumer, handler rules, adding a topic.
- [Merchant speed](merchant-speed.md): what the embedded admin may wait for, and how to measure.
- [Polaris admin guide](polaris-admin-guide.md): page anatomy, toast example, done-checklist.

## Facts

- [Shopify API invariants](shopify-api-invariants.md): verified and still-unverified findings about Shopify and Cloudflare, with the design consequence of each (the `shopify-findings` skill has the index).

## Mirrors (generated, large)

- `polaris/`: Shopify App Home reference (`npm run docs:polaris:sync`; start at `polaris/README.md`).
