---
paths:
  - "app/wiring/**"
  - "app/firesio.server.ts"
  - "workers/**"
---

# Background work: jobs, flows, events, cron

Read `node_modules/@firesio/app/src/jobs/README.md` and `.../flows/README.md`. The rules below are what the template holds to.

- **A cron only TRIGGERS.** `scheduled` drains the portal outbox and enqueues the periodic jobs of its trigger (`every: "minute" | "hour" | "day"`), keyed by the time slot, so a cron that fires
  twice is one job. The work is a JOB. An app's own scheduled step is `cron: { hourly: { name: handler } }`, which is a job `cron.<name>` too.
- **A job** (`defineJob({ kind, payload, run })`, `app/wiring/jobs.ts`, listed in `createFiresio({ jobs })`): one step of work, idempotent in effect, retried with backoff, a dead letter in D1
  (`firesio_dead_letters`, the portal can resend it) when it gives up. The payload holds ids, never personal data; `shop` in it is the job's tenant. Enqueue by kind
  (`firesio.jobs().enqueue("receipt.send", { shop, id }, { dedupeKey })`): the dedupe key is the same text every time the same work is meant and names what CHANGES it
  (`jobKey("restamp", shop, version)`). **Every job needs a duplicate-delivery test** (`@firesio/app/jobs/testing`: the same message twice runs once).
- **A flow** (`defineFlow({ name, version, input, key, run })` written with `flowKit<PresetFlowTypes<AppServices>>()`, listed in `flows`) is a process with several steps and a wait, on Workflows. Step names
  and their order are a CONTRACT: a breaking change is `version: 2` with the old definition kept registered until its instances finish. A step result is JSON, at most 1 MiB, with no personal data;
  a step may run twice, so it is idempotent (a write to Shopify uses the marker convention: `step.shopify.mutate` with `find`). `step.notify`, `step.usage` and `step.shopify` are typed. Never
  catch an error around a `step.*` call. A flow's input names its `shop`.
- **An event handler is a job.** `createFiresio({ on: { installed, uninstalled, planChanged, memberJoined, ... } })`: at least once, a stable `eventId` (dedupe on it), retried when it throws.
  There is no `lifecycle`, no `onInstall` awaited before the page and no `afterInstall` after it: do what the first page needs in its own loader.
- **The app's own services are ONE factory**, `createFiresio({ services })`, handed (as `services`) to a route, a job, an event handler, a cron step, a queue consumer, a flow and an AdminApi command alike.
  There is no `withServices`, no `around`, no `getEnv()` and no `AsyncLocalStorage` of the app's: the typed env is `firesio.context.current().env` or `services.env`.
- **The Worker entry** wraps `fetch` in `firesio.fetch(handler)` (it opens the request's context), exports `AdminApi`, `FiresioFlows` (the ONE Workflow class) and `ShopCoordinator`
  (`@firesio/app/preset/coordinator`); `FiresioRoom` only if realtime is used. A class missing from the entry fails the deploy, not the build.
- **Long work never goes in `waitUntil`** (about 30 seconds): a job or a flow. `services.afterResponse(task)` is for what follows the response and takes seconds.
- **Maintenance**: `frozen: () => ...` holds the queues and the cron; an event, a job and a flow wait, nothing is lost.
