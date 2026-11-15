import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DAILY_CRON, DEVELOPMENT_CRON, DRAIN_ONLY_CRON, KNOWN_CRONS } from "@firesio/app";
import { describe, expect, it } from "vitest";
import { stripJsonComments } from "../../scripts/wrangler-config.mjs";

/**
 * The cron expressions of wrangler.jsonc and the preset's `scheduled` handler are ONE decision: the handler drains the portal outbox
 * on every tick, and runs the daily work (the metrics snapshot, the prune) on every tick except the drain-only one. A cron the
 * preset does not know runs the daily work too, so a typo would not fail: it would run the prune every minute.
 */
const config: unknown = JSON.parse(stripJsonComments(readFileSync(join(import.meta.dirname, "../../wrangler.jsonc"), "utf8")));

function cronsOf(source: unknown): string[] {
  if (typeof source !== "object" || source === null || !("triggers" in source)) return [];
  const { triggers } = source;
  if (typeof triggers !== "object" || triggers === null || !("crons" in triggers) || !Array.isArray(triggers.crons)) return [];
  return triggers.crons.filter((cron): cron is string => typeof cron === "string");
}

function productionOf(source: unknown): unknown {
  return typeof source === "object" && source !== null && "env" in source && typeof source.env === "object" && source.env !== null && "production" in source.env ? source.env.production : undefined;
}

describe("wrangler.jsonc triggers", () => {
  it("production runs the daily cron and the every-minute outbox drain, and nothing the preset does not know", () => {
    const production = cronsOf(productionOf(config));
    expect([...production].sort()).toEqual([DAILY_CRON, DRAIN_ONLY_CRON].sort());
    for (const cron of production) expect(KNOWN_CRONS, cron).toContain(cron);
  });

  it("development has one tick that runs everything (the daily work included)", () => {
    expect(cronsOf(config)).toEqual([DEVELOPMENT_CRON]);
  });
});
