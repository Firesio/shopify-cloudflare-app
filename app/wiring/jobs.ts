/**
 * The app's own background jobs (`defineJob` of `@firesio/app/jobs`), handed to `createFiresio({ jobs })`. The template has none: its work is the preset's
 * (the periodic jobs, every event handler of `on`). A job shares ONE queue with the preset's (`<slug>-jobs`, binding `JOBS_QUEUE`), its claims (a duplicate
 * delivery runs once), its retries and its dead letters (`firesio_dead_letters`, resendable from the portal). Write one as a function of the services it uses,
 * so a test hands it fakes, and list it here:
 *
 *   export const sendReceipt = defineJob({
 *     kind: "receipt.send",                                          // lower case, digits, ".", "_", "-"
 *     payload: z.object({ shop: z.string(), orderId: z.string() }),  // ids, never personal data; `shop` is the job's tenant
 *     async run(payload, cx) { await cx.services.receipts.send(payload.shop, payload.orderId); },   // idempotent in effect; throw to be retried
 *   });
 *   export const nightly = defineJob({ kind: "reports.nightly", every: "day", payload: z.object({ day: z.string() }), schedule: (slot) => ({ day: slot.key }), async run() {} });
 *   export const JOBS = [sendReceipt, nightly] as const;
 *
 * Enqueue by kind, typed by this list: `await firesio.jobs().enqueue("receipt.send", { shop, orderId }, { dedupeKey: jobKey("receipt", orderId) })`. Every job needs a
 * duplicate-delivery test (`@firesio/app/jobs/testing`). A cron expression only triggers; the work is the job's (`.claude/rules/cloudflare.md`).
 */
export const JOBS = [] as const;
