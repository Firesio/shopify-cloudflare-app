import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindingKeys, configForEnv, stripJsonComments } from "./check-placeholders.mjs";

const config = JSON.parse(stripJsonComments(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")));
const top = configForEnv(config, "top-level");
const production = configForEnv(config, "production");
const sorted = (values) => [...values].sort();

// A named environment inherits NO binding: every one is declared again under `env.production`. A binding added to one list and
// forgotten in the other works in development and fails on the first production request, far from its cause.

test("production declares exactly the bindings the top level declares", () => {
  assert.deepEqual(sorted(bindingKeys(production)), sorted(bindingKeys(top)));
});

test("production declares the same vars and the same secret names", () => {
  // The one local-only slot: a secret in production, an empty var locally so .dev.vars can fill it.
  const localOnly = new Set(["TURNSTILE_SECRET_KEY"]);
  assert.deepEqual(sorted(Object.keys(production.vars)), sorted(Object.keys(top.vars).filter((name) => !localOnly.has(name))));
  assert.deepEqual(sorted(production.secrets.required), sorted(top.secrets.required));
});

test("the two environments name different queues, and each queue consumer has a dead-letter queue", () => {
  const names = (env) => (env.queues?.producers ?? []).map((producer) => producer.queue);
  for (const queue of names(top)) assert.ok(!names(production).includes(queue), `${queue} is shared by both environments`);
  for (const env of [top, production]) {
    for (const consumer of env.queues.consumers) assert.ok(consumer.dead_letter_queue, `${consumer.queue} has no dead-letter queue`);
  }
});

test("the portal events queue is a producer in both environments (its DLQ belongs to the portal's consumer)", () => {
  assert.equal(top.queues.producers.find((entry) => entry.binding === "PORTAL_EVENTS")?.queue, "portal-events");
  assert.equal(production.queues.producers.find((entry) => entry.binding === "PORTAL_EVENTS")?.queue, "portal-events-prod");
});

test("every production cron is one app/core/cron.ts knows, and development runs everything on one tick", () => {
  const source = readFileSync(new URL("../app/core/cron.ts", import.meta.url), "utf8");
  const known = [...source.matchAll(/(?:DRAIN_ONLY_CRON|DAILY_CRON) = "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(sorted(known), sorted(["* * * * *", "30 3 * * *"]));
  for (const cron of production.triggers.crons) assert.ok(known.includes(cron), `production cron "${cron}" is unknown to core/cron.ts`);
  for (const cron of top.triggers.crons) assert.ok(!known.includes(cron), `development cron "${cron}" would not run the daily work`);
});

test("the rate limiters keep the same limits in both environments", () => {
  assert.deepEqual(production.ratelimits, top.ratelimits);
});
