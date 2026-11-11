---
paths:
  - "app/ai/**"
  - "app/ports/ai*"
  - "app/models/ai*"
  - "app/wiring/ai*"
  - "app/routes/internal/ai*"
  - "app/routes/resources/ai-*"
---

# Workers AI

The service-list row for Workers AI is in `.claude/rules/cloudflare.md`; recipe for a new feature: the `add-ai-task` skill.

**Workers AI moved IN SCOPE**, and here is the written reason. Support staff
answer the same questions repeatedly, and a draft they edit is faster than a
reply they compose; drafting is also the safest possible first AI surface,
because a human reads every word before a merchant does. Workers AI rather than
a hosted provider because it is a BINDING: no API key to store, rotate or leak,
no egress, and it bills on the same account as everything else. The AI SDK
(`ai` + `workers-ai-provider`) sits behind our own port, so swapping to a hosted
model later is an adapter change and nothing above it moves.

The constraints that come with it:

- **No model id is ever hardcoded in a feature.** A caller names a ROLE
  (`writing`, `summary`); which model serves that role is a row in `ai_models`,
  chosen from a catalogue in the internal console. A typo'd or retired id
  resolves to nothing at call time, which reads as a broken feature rather than
  a bad setting — hence a select, never a text field.
- **Setup is one click, never a silent default.** `/internal/ai` has a "Set up recommended" button that fills only the
  purposes with no models (`planRecommended("empty", …)`, pure, in `app/ai/preset.ts`) and a confirmed "Reset all". A
  purpose with no models is OFF, so the page counts them. Writes go through `AiRepo.replaceChains`, one batch: a
  purpose is replaced whole or not at all. A new purpose needs no edit here; it is picked up from `MODEL_ROLES`.
- **Every call is metered.** One `ai_runs` row per call, with tokens and
  latency, because tokens are what cost money and an unmetered AI surface is an
  unbounded bill.
- **AI is decoration, never correctness.** A failed or absent model degrades the
  feature to "no draft"; it must never block a reply being sent
  (@rules/data.md).

**The two extension points, and what they cost.** The base is deliberately
policy-free; both seams below are where an app adds its own.

- **A new AI feature is one file.** `defineAiTask` for prose or
  `defineAiObjectTask` for a value of a known shape (`app/ai/task.ts`) — name the
  purpose it needs, name itself for the ledger, turn its input into messages —
  then `run` / `runObject` / `stream` on `AiService`. It inherits the gate, the
  fallback chain, health tracking, metering and streaming, because none of those
  are a feature's job. An object task's Zod schema is sent to the model as JSON
  Schema AND validated on the way back, and a wrong shape falls through to the
  next model rather than reaching the caller. `app/ai/task.test.ts` asserts all
  of this: if adding a task ever needs a change to the service, adapter, gate or
  ledger, that test fails and the base has stopped being extensible.
- **Ports are bound in `app/wiring.server.ts`, nowhere else.** A use case
  declares a port and receives an implementation; it must never import an
  adapter (@rules/core.md). Swapping the provider, or the gating policy,
  is a line in that file.
- **Gating is composed, not built in.** `app/ai/gate.ts` ships `allowAll` and
  `composeGates`; the base contains no notion of a plan or a quota, because those
  differ per app and a base that guesses makes every app delete code first. An
  app writes one `AiGate` and names it in its composition root. `merchantsOnly`
  wraps a policy so our own console is never gated by a merchant's plan — the
  mistake that otherwise breaks the support desk on a downgrade.
