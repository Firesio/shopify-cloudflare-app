import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bindingKeys, configForEnv, stripJsonComments } from "./check-placeholders.mjs";
import { QUEUE_ROLES, productionRouteIssues, queueNameIssues, slugOf } from "./launch-config-checks.mjs";

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

test("the two environments name different queues, and every dead-letter queue is consumed in both", () => {
  const names = (env) => (env.queues?.producers ?? []).map((producer) => producer.queue);
  for (const queue of names(top)) assert.ok(!names(production).includes(queue), `${queue} is shared by both environments`);
  for (const env of [top, production]) {
    const withDeadLetters = env.queues.consumers.filter((consumer) => consumer.dead_letter_queue !== undefined);
    assert.equal(withDeadLetters.length, QUEUE_ROLES.length, "one consumer per role has a dead-letter queue");
    for (const consumer of withDeadLetters) assert.ok(env.queues.consumers.some((entry) => entry.queue === consumer.dead_letter_queue), `${consumer.dead_letter_queue} has no consumer: the preset would never copy what lands there into D1`);
  }
});

test("the queues are named after the slug in app/core/identity.ts, <slug>-<role>[-dlq][-prod], and consumed in both environments", () => {
  const slug = slugOf(readFileSync(new URL("../app/core/identity.ts", import.meta.url), "utf8"));
  assert.ok(slug);
  assert.deepEqual(queueNameIssues(config, slug), []);
  for (const { role, binding } of QUEUE_ROLES) {
    if (binding === null) continue;
    assert.deepEqual(top.queues.producers.find((entry) => entry.binding === binding), { binding, queue: `${slug}-${role}` });
    assert.deepEqual(production.queues.producers.find((entry) => entry.binding === binding), { binding, queue: `${slug}-${role}-prod` });
  }
  // The jobs queue's max_retries is the platform's ceiling on purpose: the job system counts its own attempts.
  assert.equal(top.queues.consumers.find((entry) => entry.queue === `${slug}-jobs`)?.max_retries, 100);
  // A producer or a consumer forgotten in one environment is named, not found in production.
  const forgotten = structuredClone(config);
  forgotten.env.production.queues.producers = forgotten.env.production.queues.producers.filter((entry) => entry.binding !== "JOBS_QUEUE");
  forgotten.env.production.queues.consumers = forgotten.env.production.queues.consumers.filter((entry) => !entry.queue.includes("-jobs"));
  const issues = queueNameIssues(forgotten, slug).join("\n");
  assert.match(issues, /env\.production: the JOBS_QUEUE producer must be/);
  assert.match(issues, /env\.production: the queue consumers must be/);
});

test("the Workflow, the Durable Object, the dataset and the version metadata are declared in both environments, with the shop coordinator's SQLite migration", () => {
  for (const env of [top, production]) {
    assert.equal(env.workflows?.[0]?.binding, "FLOWS");
    assert.equal(env.workflows?.[0]?.class_name, "FiresioFlows");
    assert.deepEqual(env.durable_objects?.bindings, [{ name: "SHOP_COORDINATOR", class_name: "ShopCoordinator" }]);
    assert.deepEqual(env.migrations, [{ tag: "v1", new_sqlite_classes: ["ShopCoordinator"] }]);
    assert.equal(env.analytics_engine_datasets?.[0]?.binding, "USAGE");
    assert.deepEqual(env.version_metadata, { binding: "CF_VERSION_METADATA" });
  }
  assert.notEqual(top.workflows[0].name, production.workflows[0].name, "the two environments share no Workflow");
});

test("both environments cap CPU below the platform's 30 s default and sample traces, and keep logs whole", () => {
  for (const env of [top, production]) {
    assert.ok(env.limits.cpu_ms > 0 && env.limits.cpu_ms < 30_000);
    assert.equal(env.observability.enabled, true);
    assert.equal(env.observability.head_sampling_rate, 1);
    assert.equal(env.observability.redact_query_string, true);
    assert.equal(env.observability.traces.enabled, true);
    assert.ok(env.observability.traces.head_sampling_rate > 0 && env.observability.traces.head_sampling_rate < 1);
  }
});

test("NOTIFY_SECRET is a secret in both environments (32 or more characters: the preset refuses to build without it)", () => {
  for (const env of [top, production]) assert.ok(env.secrets.required.includes("NOTIFY_SECRET"));
});

test("the previews block names its own staging resources, never production's", () => {
  const previews = config.previews;
  assert.ok(previews, "wrangler.jsonc has a previews block");
  const ids = JSON.stringify(previews);
  for (const binding of production.d1_databases) assert.ok(!ids.includes(binding.database_name), "a preview must not share production's database");
  assert.equal(previews.d1_databases[0].binding, "DB");
  assert.equal(previews.kv_namespaces[0].binding, "SESSION");
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
