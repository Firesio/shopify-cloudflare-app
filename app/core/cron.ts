/**
 * Which work a cron expression runs. The expression in `wrangler.jsonc` and this constant are ONE decision:
 * `scripts/wrangler-bindings.test.mjs` fails when production names a cron this file does not know.
 *
 * The outbox drains on every tick. The daily work (the metrics snapshot, the prune of old rows) runs on every tick except the
 * drain-only one, so the daily production cron and the five-minute development one run it, and an unrecognised
 * string runs more rather than less: every step is idempotent, whereas a cron that ran nothing would stop the work unseen.
 */
export const DRAIN_ONLY_CRON = "* * * * *";
export const DAILY_CRON = "30 3 * * *";

export interface CronPlan {
  readonly drain: true;
  readonly daily: boolean;
}

export function cronPlanFor(cron: string): CronPlan {
  return { drain: true, daily: cron !== DRAIN_ONLY_CRON };
}
