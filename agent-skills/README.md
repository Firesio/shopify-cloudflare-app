# agent-skills

Skills for Claude Code (it reads `.claude/skills/`, which is per-developer and gitignored). This folder is the tracked source, and `scripts/setup-skills.mjs` puts everything in place.

| What | Where | How a clone gets it |
|---|---|---|
| Skills written in this repo | `agent-skills/<name>/SKILL.md` | linked into `.claude/skills` |
| Skills from other repos | listed in `third-party.json` | fetched at a pinned commit, checked against a content hash, copied into `.claude/skills` |

`npm install` runs it (through `prepare`, in `--soft` mode: a network problem warns and never breaks the install). It does nothing when `CI` or `SKIP_AGENT_SKILLS` is set, because builds do not need agent skills.

```bash
npm run setup:skills          # install now, fail loudly
npm run setup:skills -- --check   # verify only, no network
```

## Add a skill written here

Create `agent-skills/<name>/SKILL.md` (with `name` and `description` frontmatter) and run `npm run setup:skills`.

## Add or update a third-party skill

1. Pick the commit to pin (`ref`, 40 characters) and the skill's folder in that repo.
2. Get its hash from a checkout of that commit: `node scripts/setup-skills.mjs --hash path/to/skill-folder`.
3. Add the entry to `third-party.json`. A changed upstream cannot slip in: the hash must match.
4. Read the skill before pinning it. A skill is instructions an agent will follow.

## What is here today

- `third-party.json`: no third-party skills (empty `sources`).
- `shopify-findings`: where to look in `docs/shopify-api-invariants.md` before relying on remembered Shopify/Cloudflare behaviour.
