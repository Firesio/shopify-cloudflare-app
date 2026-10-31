# agent-skills

Skills for coding agents (Claude Code reads `.claude/skills/`, Codex reads `.agents/skills/`). Both of those folders are per-developer and gitignored. This folder is the tracked source, and `scripts/setup-skills.mjs` puts everything in place.

| What | Where | How a clone gets it |
|---|---|---|
| Skills written in this repo | `agent-skills/<name>/SKILL.md` | linked into `.claude/skills` and `.agents/skills` |
| Skills from other repos | listed in `third-party.json` | fetched at a pinned commit, checked against a content hash, copied into `.agents/skills`, linked for Claude Code |

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

## What is in `third-party.json` today

Five skills from [MengTo/Skills](https://github.com/MengTo/Skills) (MIT): `landing-page`, `pricing-page`, `editorial-tech`, `build-awwwards-quality-sites`, `build-threejs-scroll-worlds`.

## Written here

- `illustrated-3d-landing`: a painted, cinematic parallax 3D landing page (three.js, layered artwork, one scroll value drives the camera). Works with artwork from any generator.
