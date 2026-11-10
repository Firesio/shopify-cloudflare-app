# Documentation

Reference material for people and agents. **Nothing here is loaded automatically** by Claude Code: search with `rg`, open the section you need.
What an agent must always follow is in `CLAUDE.md`; per-area rules are in `.claude/rules/` (loaded when matching files are opened); step-by-step recipes are in `agent-skills/`.

## Starting and running an app

- [New app setup](SETUP.md): the canonical copy-and-start workflow.
- [Adoption checklist](ADOPTING_THE_TEMPLATE.md): product, compliance and release decisions.
- [Legal content template](LEGAL_TEMPLATE.md): required policy inputs.
- [Operations runbook](OPERATIONS.md): deploy, roll back, D1 backup and recovery, secrets, webhook DLQ replay.
- [Upgrading](UPGRADING.md): per-change checklists for an app already in production, newest first.

## How the systems work

- [Receiving Shopify webhooks](webhooks.md): receiver and consumer design, handler rules, topic classes, adding a topic.
- [Merchant speed](merchant-speed.md): what the embedded admin may wait for, and how to measure.
- [Entitlements](entitlements.md) and [template notes](entitlements-template.md): the billing and quota model.
- [Internationalisation](i18n.md): file map, language selection, audiences, recipes.
- [Members](members.md): file map, decided edge cases, known limits (rule: `.claude/rules/members.md`).
- [Campaigns](campaigns.md) and [porting them to another app](PORTING_CAMPAIGNS.md).
- [Support inbox](support-inbox.md): trying it locally, unverified items.
- [Polaris admin guide](polaris-admin-guide.md): page anatomy, toast example, done-checklist.
- [Illustrations](illustrations.md): assets used and their licences.

## Facts

- [Shopify API invariants](shopify-api-invariants.md): verified and still-unverified findings about Shopify and Cloudflare, with the design consequence of each. Read the section you need (the `shopify-findings` skill has the index).

## Mirrors (generated, large)

- `polaris/`: Shopify App Home reference (`npm run docs:polaris:sync`; start at `polaris/README.md`).
- `shadcn/`: shadcn/ui docs for the staff console (`npm run docs:shadcn:sync`).
