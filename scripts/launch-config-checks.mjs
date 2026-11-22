// Checks of the launch contract that read wrangler.jsonc and the two shopify.app*.toml files. Split out of
// check-placeholders.mjs (which wires them in and runs them before a deploy); each one returns a list of issues, empty when fine.
import { tomlSectionBool, tomlWebhookSubscriptions } from "./toml-lite.mjs";
import { configForEnv } from "./wrangler-config.mjs";

/** Anything that looks like "fill this in". */
export const PLACEHOLDER = /REPLACE|CHANGE_?ME|TODO|XXXX|your-?(domain|account)/i;

/** The app's own name as `app/core/identity.ts` declares it (`slug: "..."`), or null. */
export function slugOf(identitySource) {
  return /\bslug\s*:\s*"([^"\n]+)"/.exec(identitySource ?? "")?.[1] ?? null;
}

/**
 * The queue roles the preset consumes (`@firesio/app`: ONE naming rule, `<slug>-<role>[-dlq][-prod]`; `firesio.queue` refuses a batch of any other queue). Each has a main
 * queue and a dead-letter queue, both consumed by this Worker: the preset copies a dead letter into D1 (`firesio_dead_letters`) where the portal can resend it, so a
 * dead-letter queue nobody consumes would let messages expire unread in four days. `binding` is the producer this app writes to (the mail-events queue has none: Email
 * Sending's event subscription writes to it). `portal-events*` is the portal's and is never checked here.
 */
export const QUEUE_ROLES = [
  { role: "webhooks", binding: "WEBHOOK_QUEUE", maxRetries: 8 },
  { role: "jobs", binding: "JOBS_QUEUE", maxRetries: 100 },
  { role: "notify", binding: "NOTIFY_QUEUE", maxRetries: 8 },
  { role: "mail-events", binding: null, maxRetries: 8 },
];

const queueNameOf = (slug, role, dlq, production) => `${slug}-${role}${dlq ? "-dlq" : ""}${production ? "-prod" : ""}`;

/**
 * The queues are named after the slug and consumed, in both environments: every role's producer (where it has one) writes to the main queue, the consumers are exactly the main
 * queues and their dead-letter queues, each main consumer names its dead-letter queue, and the jobs queue's `max_retries` is the platform's ceiling (the job system counts
 * its own attempts and backs off per job, so Cloudflare's limit must never be what ends a job).
 */
export function queueNameIssues(wrangler, slug) {
  if (slug === null) return ["app/core/identity.ts has no slug: the queue names cannot be checked"];
  const issues = [];
  for (const [label, env, production] of [["top level", configForEnv(wrangler, "top-level"), false], ["env.production", configForEnv(wrangler, "production"), true]]) {
    const consumers = env?.queues?.consumers ?? [];
    const wanted = QUEUE_ROLES.flatMap(({ role }) => [queueNameOf(slug, role, false, production), queueNameOf(slug, role, true, production)]);
    const names = consumers.map((entry) => entry.queue);
    if (names.length !== wanted.length || !wanted.every((name) => names.includes(name))) {
      issues.push(`wrangler.jsonc ${label}: the queue consumers must be ${wanted.map((name) => `"${name}"`).join(", ")} (found ${JSON.stringify(names)})`);
    }
    for (const { role, binding, maxRetries } of QUEUE_ROLES) {
      const queue = queueNameOf(slug, role, false, production);
      const dlq = queueNameOf(slug, role, true, production);
      if (binding !== null) {
        const producer = env?.queues?.producers?.find((entry) => entry.binding === binding)?.queue;
        if (producer !== queue) issues.push(`wrangler.jsonc ${label}: the ${binding} producer must be "${queue}" (found ${JSON.stringify(producer ?? null)})`);
      }
      const main = consumers.find((entry) => entry.queue === queue);
      if (main !== undefined && main.dead_letter_queue !== dlq) issues.push(`wrangler.jsonc ${label}: the dead-letter queue of "${queue}" must be "${dlq}" (found ${JSON.stringify(main.dead_letter_queue ?? null)})`);
      if (main !== undefined && main.max_retries !== maxRetries) issues.push(`wrangler.jsonc ${label}: "${queue}" must have max_retries ${maxRetries} (found ${JSON.stringify(main.max_retries ?? null)})`);
    }
  }
  return issues;
}

/** Production answers on one custom domain (the host of SHOPIFY_APP_URL), with no workers.dev address and no preview URLs. */
export function productionRouteIssues(production) {
  const issues = [];
  const routes = production.routes ?? [];
  if (routes.length === 0 || routes.some((route) => route?.custom_domain !== true || typeof route.pattern !== "string" || route.pattern === "")) {
    issues.push('wrangler.jsonc env.production.routes must be [{ "pattern": "<the app host>", "custom_domain": true }]');
  }
  if (production.workers_dev !== false) issues.push("wrangler.jsonc env.production.workers_dev must be false");
  if (production.preview_urls !== false) issues.push("wrangler.jsonc env.production.preview_urls must be false");
  const url = production.vars?.SHOPIFY_APP_URL;
  const host = typeof url === "string" && /^https:\/\//.test(url) ? new URL(url).host : null;
  if (host !== null && routes.length > 0 && !routes.some((route) => route?.pattern === host || PLACEHOLDER.test(String(route?.pattern)))) {
    issues.push(`wrangler.jsonc env.production.routes has no custom domain "${host}" (the host of SHOPIFY_APP_URL)`);
  }
  return issues;
}

/** A subscription as one comparable string: `topic:app/uninstalled -> /webhooks/...`, one per topic. */
function subscriptionLines(toml) {
  return tomlWebhookSubscriptions(toml)
    .flatMap(({ topics, complianceTopics, uri }) => [...topics.map((topic) => `${topic} -> ${uri}`), ...complianceTopics.map((topic) => `compliance ${topic} -> ${uri}`)])
    .sort();
}

const REQUIRED_TOPICS = ["app/uninstalled -> /webhooks/app/uninstalled", "compliance customers/data_request", "compliance customers/redact", "compliance shop/redact"];

/**
 * `shopify app config link` rewrites the file it links and DROPS the webhook subscriptions (and `[build]` settings) it does not
 * know: seen in testing, silently, with a green deploy. Both tomls must subscribe the same topics at the same URIs, every URI is
 * ours (`/webhooks/...`, one receiver), the three compliance topics and `app/uninstalled` are always there, and the build flags
 * the dev loop and the deploy rely on survive.
 */
export function webhookSubscriptionIssues(productionToml, developmentToml) {
  const issues = [];
  const files = [["shopify.app.toml", productionToml], ["shopify.app.dev.toml", developmentToml]];
  for (const [name, toml] of files) {
    const subscriptions = tomlWebhookSubscriptions(toml);
    for (const { uri } of subscriptions) {
      if (!uri.startsWith("/webhooks/")) issues.push(`${name}: webhook subscription uri "${uri}" must start with /webhooks/`);
    }
    const lines = subscriptionLines(toml);
    for (const required of REQUIRED_TOPICS) {
      if (!lines.some((line) => line.startsWith(required))) issues.push(`${name}: no webhook subscription for ${required.split(" -> ")[0]} (did \`shopify app config link\` drop it?)`);
    }
  }
  const [production, development] = files.map(([, toml]) => subscriptionLines(toml));
  for (const line of production) if (!development.includes(line)) issues.push(`shopify.app.dev.toml lacks the webhook subscription ${line}`);
  for (const line of development) if (!production.includes(line)) issues.push(`shopify.app.toml lacks the webhook subscription ${line}`);
  return issues;
}

/** `[build]` flags: the dev app follows the tunnel, production's URL is fixed, and both deploy their config with the app. */
export function buildFlagIssues(productionToml, developmentToml) {
  const expectations = [
    ["shopify.app.toml", productionToml, { automatically_update_urls_on_dev: false, include_config_on_deploy: true }],
    ["shopify.app.dev.toml", developmentToml, { automatically_update_urls_on_dev: true, include_config_on_deploy: true }],
  ];
  return expectations.flatMap(([name, toml, flags]) =>
    Object.entries(flags).flatMap(([key, wanted]) => (tomlSectionBool(toml, "build", key) === wanted ? [] : [`${name}: [build] ${key} must be ${wanted} (did \`shopify app config link\` drop it?)`])),
  );
}
