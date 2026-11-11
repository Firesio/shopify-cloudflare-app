---
name: add-ai-task
description: Add a Workers AI feature as one task file (prompt, role, ledger name, gate, tests). Use when a new AI-assisted feature is needed or an existing one in app/ai changes.
---

# Add an AI task

Contract: `.claude/rules/ai.md` (loads when you open `app/ai/**`). AI is decoration: a failed or absent model must degrade to "no result" and never block the user's action.

1. **One file** in `app/ai/tasks/<name>.ts` using `defineAiTask` (prose), `defineAiObjectTask` (a value of a known Zod shape; a wrong shape falls through to the next model) or `defineAiDecisionTask` (the probability of a yes/no question, scored by a decision model; `spam-triage.ts`). Examples: `app/ai/tasks/reply.ts`, `thread-summary.ts`.
   - `feature`: the ledger name, like `support.reply_draft`.
   - `role`: a **role** (`writing`, `summary`, `reasoning`, `extraction`, `classification`, and `decision` for a decision task), never a model id. Which model serves a role is a row in `ai_models`, chosen in the console.
   - `buildMessages`: a pure function of the input. Put long prompts in their own file beside it (`reply-prompt.ts`).
2. **Role in use**: update `ROLES_IN_USE` in `app/ai/roles.ts` so the console shows what asks for it. A genuinely new role also needs the catalogue (`app/ai/catalogue.ts`, `npm run ai:catalogue`).
3. **Run it** through `AiService` (`run` / `runObject` / `runDecision` / `stream`) which the composition root `app/wiring.server.ts` provides (`aiService`); the task inherits the gate, fallback chain, health tracking and metering. If adding a task forces changes to the service, gate or ledger, stop: `app/ai/task.test.ts` exists to catch that.
4. **Gate**: any plan or quota policy is an `AiGate` composed in wiring (`app/ai/gate.ts`); never hardcode a plan handle in the task. Entitlement keys: see the `add-entitlement` skill.
5. **Tests**: prompt builder (pure, exhaustive) and the task through a fake model port. No real model calls.
