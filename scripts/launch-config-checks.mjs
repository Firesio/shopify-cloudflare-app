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
 * The webhook queue names are derived from the slug (`@firesio/app` consumes `<slug>-webhooks` / `<slug>-webhooks-prod`: the preset's
 * `queue` handler refuses any other batch), so a queue that does not carry it is a webhook queue nobody consumes. The dead-letter
 * queues, when declared, follow the same pattern. `portal-events*` is the portal's and is never checked here.
 */
export function queueNameIssues(wrangler, slug) {
  if (slug === null) return ["app/core/identity.ts has no slug: the webhook queue names cannot be checked"];
  const expectations = [
    { label: "top level", env: configForEnv(wrangler, "top-level"), queue: `${slug}-webhooks`, dlq: `${slug}-webhooks-dlq` },
    { label: "env.production", env: configForEnv(wrangler, "production"), queue: `${slug}-webhooks-prod`, dlq: `${slug}-webhooks-dlq-prod` },
  ];
  const issues = [];
  for (const { label, env, queue, dlq } of expectations) {
    const producer = env?.queues?.producers?.find((entry) => entry.binding === "WEBHOOK_QUEUE")?.queue;
    if (producer !== queue) issues.push(`wrangler.jsonc ${label}: the WEBHOOK_QUEUE producer must be "${queue}" (found ${JSON.stringify(producer ?? null)})`);
    const consumers = env?.queues?.consumers ?? [];
    if (consumers.length !== 1 || consumers[0].queue !== queue) {
      issues.push(`wrangler.jsonc ${label}: the only queue consumer must be "${queue}" (found ${JSON.stringify(consumers.map((entry) => entry.queue))})`);
    }
    for (const consumer of consumers) {
      if (consumer.dead_letter_queue !== undefined && consumer.dead_letter_queue !== dlq) issues.push(`wrangler.jsonc ${label}: the dead-letter queue of "${consumer.queue}" must be "${dlq}" (found "${consumer.dead_letter_queue}")`);
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
