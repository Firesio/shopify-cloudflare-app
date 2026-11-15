import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindingKeys, configForEnv, stripJsonComments } from "./check-placeholders.mjs";
import { productionRouteIssues, queueNameIssues, slugOf } from "./launch-config-checks.mjs";

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

test("the two environments name different queues, and the webhook queue's dead-letter queue is consumed in both", () => {
  const names = (env) => (env.queues?.producers ?? []).map((producer) => producer.queue);
  for (const queue of names(top)) assert.ok(!names(production).includes(queue), `${queue} is shared by both environments`);
  for (const env of [top, production]) {
    const webhooks = env.queues.consumers.filter((consumer) => consumer.dead_letter_queue !== undefined);
    assert.equal(webhooks.length, 1, "one consumer has a dead-letter queue: the webhook queue");
    assert.ok(env.queues.consumers.some((consumer) => consumer.queue === webhooks[0].dead_letter_queue), `${webhooks[0].dead_letter_queue} has no consumer: the preset would never record what lands there`);
  }
});

test("the webhook queues are named after the slug in app/core/identity.ts, in both environments", () => {
  const slug = slugOf(readFileSync(new URL("../app/core/identity.ts", import.meta.url), "utf8"));
  assert.ok(slug);
  assert.deepEqual(queueNameIssues(config, slug), []);
  assert.deepEqual(top.queues.producers.find((entry) => entry.binding === "WEBHOOK_QUEUE"), { binding: "WEBHOOK_QUEUE", queue: `${slug}-webhooks` });
  assert.deepEqual(top.queues.consumers.map((entry) => [entry.queue, entry.dead_letter_queue]), [[`${slug}-webhooks`, `${slug}-webhooks-dlq`], [`${slug}-webhooks-dlq`, undefined]]);
  assert.deepEqual(production.queues.producers.find((entry) => entry.binding === "WEBHOOK_QUEUE"), { binding: "WEBHOOK_QUEUE", queue: `${slug}-webhooks-prod` });
  assert.deepEqual(production.queues.consumers.map((entry) => [entry.queue, entry.dead_letter_queue]), [[`${slug}-webhooks-prod`, `${slug}-webhooks-dlq-prod`], [`${slug}-webhooks-dlq-prod`, undefined]]);
});

test("production is on one custom domain only: no workers.dev, no preview URLs (and the top level is not)", () => {
  assert.deepEqual(productionRouteIssues({ ...production, routes: [{ pattern: "example.com", custom_domain: true }] }), []);
  assert.deepEqual(production.routes, [{ pattern: "REPLACE_ME", custom_domain: true }]);
  assert.equal(production.workers_dev, false);
  assert.equal(production.preview_urls, false);
  // The top level is Miniflare's: it takes no route.
  assert.equal(top.routes, undefined);
});

test("the portal events queue is a producer in both environments (its DLQ belongs to the portal's consumer)", () => {
  assert.equal(top.queues.producers.find((entry) => entry.binding === "PORTAL_EVENTS")?.queue, "portal-events");
  assert.equal(production.queues.producers.find((entry) => entry.binding === "PORTAL_EVENTS")?.queue, "portal-events-prod");
});

test("the rate limiters keep the same limits in both environments", () => {
  assert.deepEqual(production.ratelimits, top.ratelimits);
});
