import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apiVersionOf, launchWarnings, stripJsonComments, validateLaunchContract } from "./check-placeholders.mjs";
import { buildFlagIssues, queueNameIssues, webhookSubscriptionIssues } from "./launch-config-checks.mjs";

/** The subscriptions both tomls carry: the uninstall topic and the three compliance topics, each at its own URI. */
const SUBSCRIPTIONS = `
  [[webhooks.subscriptions]]
  topics = [ "app/uninstalled" ]
  uri = "/webhooks/app/uninstalled"

  [[webhooks.subscriptions]]
  compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]
  uri = "/webhooks/compliance"

`;

function validFiles() {
  const production = {
    kv_namespaces: [
      { binding: "SESSION", id: "0123456789abcdef0123456789abcdef" },
      { binding: "PORTAL_BLOCKLIST", id: "fedcba9876543210fedcba9876543210" },
    ],
    d1_databases: [{ binding: "DB", database_id: "11111111-2222-3333-4444-555555555555" }],
    vars: {
      SHOPIFY_API_KEY: "client-key",
      SHOPIFY_APP_URL: "https://app.example.org",
      PARTNER_APP_ID: "123456",
      PARTNER_ORG_ID: "1234567",
      EVENT_HASH_KEY_ID: "firesio-1",
      SCOPES: "",
      AI_GATEWAY_ID: "",
      TURNSTILE_SITE_KEY: "0x4AAAAAAAexample",
    },
    secrets: { required: ["PARTNER_API_TOKEN", "ATTACHMENT_TOKEN_SECRET", "EVENT_HASH_SECRET"] },
    r2_buckets: [{ binding: "UPLOADS", bucket_name: "uploads" }],
    send_email: [{ name: "EMAIL" }],
    ai: { binding: "AI" },
    queues: {
      producers: [{ binding: "WEBHOOK_QUEUE", queue: "useful-app-webhooks-prod" }, { binding: "PORTAL_EVENTS", queue: "portal-events-prod" }],
      consumers: [{ queue: "useful-app-webhooks-prod", max_retries: 5, dead_letter_queue: "useful-app-webhooks-dlq-prod" }],
    },
    routes: [{ pattern: "app.example.org", custom_domain: true }],
    workers_dev: false,
    preview_urls: false,
    ratelimits: [{ name: "SUPPORT_LIMITER" }, { name: "SUPPORT_FORM_LIMITER" }, { name: "SUPPORT_MAIL_LIMITER" }],
    triggers: { crons: ["30 3 * * *", "* * * * *"] },
  };
  // The top level (development) names its queues without the production suffix.
  const development = {
    ...structuredClone(production),
    queues: {
      producers: [{ binding: "WEBHOOK_QUEUE", queue: "useful-app-webhooks" }, { binding: "PORTAL_EVENTS", queue: "portal-events" }],
      consumers: [{ queue: "useful-app-webhooks", max_retries: 5, dead_letter_queue: "useful-app-webhooks-dlq" }],
    },
  };
  return {
    wrangler: { ...development, env: { production } },
    productionToml: `client_id = "client-key"\napplication_url = "https://app.example.org"\n[build]\nautomatically_update_urls_on_dev = false\ninclude_config_on_deploy = true\n[webhooks]\napi_version = "2026-10"\n${SUBSCRIPTIONS}[access_scopes]\nscopes = ""\n[auth]\nredirect_urls = [ "https://app.example.org/auth/callback" ]`,
    developmentToml: `client_id = "dev-key"\napplication_url = "https://dev.example.org"\n[webhooks]\napi_version = "2026-10"\n${SUBSCRIPTIONS}[access_scopes]\nscopes = ""\n[auth]\nredirect_urls = [ "https://dev.example.org/auth/callback" ]\n[build]\ninclude_config_on_deploy = true\nautomatically_update_urls_on_dev = true`,
    apiVersionSource: 'import { ApiVersion } from "@shopify/shopify-app-react-router/server";\nexport const apiVersion = ApiVersion.October26;',
    legal: 'export const x = "Our policy";',
    identity: 'slug: "useful-app", name: "Useful App", companyName: "Example LLC", supportEmail: "support@example.org", address: "1 Main Street", effectiveDate: "2026-09-01"',
    plans: 'name: "Free"\nname: "Pro"',
    publicCopy: "Clear support. Email support@example.org.",
    routeSources: [{ path: "app/routes/app/home.tsx", source: "export default function Home() { return null; }" }],
  };
}

test("accepts populated production config while allowing local fixture values", () => {
  assert.deepEqual(validateLaunchContract(validFiles()), []);
});

test("refuses a plan table, public page or home page that is still template copy", () => {
  const plans = validateLaunchContract({ ...validFiles(), plans: 'name: "TODO:FREE"' });
  assert.match(plans[0], /plans\.ts still has placeholder/);
  const pages = validateLaunchContract({ ...validFiles(), publicCopy: "TODO: what your app does" });
  assert.match(pages[0], /public pages/);
  const home = validateLaunchContract({ ...validFiles(), routeSources: [{ path: "app/routes/app/home.tsx", source: "<p>TODO: replace</p>" }] });
  assert.match(home[0], /app\/routes\/app\/home\.tsx is still the template's placeholder page/);
});

test("requires both the drain cron and the daily cron in production", () => {
  const noDrain = validFiles();
  noDrain.wrangler.env.production.triggers = { crons: ["30 3 * * *"] };
  assert.match(validateLaunchContract(noDrain).join("\n"), /drain cron/);
  const noDaily = validFiles();
  noDaily.wrangler.env.production.triggers = { crons: ["* * * * *"] };
  assert.match(validateLaunchContract(noDaily).join("\n"), /daily cron/);
});

test("reports an absent production binding by its exact key", () => {
  const files = validFiles();
  files.wrangler.env.production.queues.producers = [{ binding: "WEBHOOK_QUEUE", queue: "useful-app-webhooks-prod" }];
  assert.ok(validateLaunchContract(files).includes("production binding PORTAL_EVENTS is missing"));
});

test("rejects a top-level var omitted from production, and a missing secret", () => {
  const files = validFiles();
  files.wrangler.vars = { ...files.wrangler.vars, STAFF_ALERT_EMAIL: "" };
  assert.ok(validateLaunchContract(files).includes("production var STAFF_ALERT_EMAIL is missing"));
  const secret = validFiles();
  secret.wrangler.env.production.secrets = { required: ["PARTNER_API_TOKEN", "ATTACHMENT_TOKEN_SECRET"] };
  assert.ok(validateLaunchContract(secret).includes("EVENT_HASH_SECRET secret is not declared"));
});

test("rejects production config without a webhook queue consumer", () => {
  const files = validFiles();
  files.wrangler.env.production.queues.consumers = [];
  assert.ok(validateLaunchContract(files).some((issue) => /consumer/.test(issue)));
});

test("rejects every launch placeholder and redirect drift", () => {
  const files = validFiles();
  files.wrangler.env.production.vars.PARTNER_ORG_ID = "";
  files.wrangler.env.production.vars.EVENT_HASH_KEY_ID = "REPLACE_ME";
  files.productionToml = files.productionToml.replace("https://app.example.org/auth/callback", "https://elsewhere.example.org/auth/callback");
  const issues = validateLaunchContract(files);
  assert.ok(issues.includes("PARTNER_ORG_ID is missing or placeholder"));
  assert.ok(issues.includes("EVENT_HASH_KEY_ID is missing or placeholder"));
  assert.ok(issues.includes("shopify.app.toml redirect_urls drift from application_url"));
});

test("rejects placeholders in the dedicated identity source and an impossible policy date", () => {
  assert.ok(validateLaunchContract({ ...validFiles(), identity: 'slug: "my-app", name: "TODO: Your App Name", companyName: "Firesio", supportEmail: "a@b.org", address: "x", effectiveDate: "2026-09-01"' }).some((issue) => /identity/.test(issue)));
  assert.ok(validateLaunchContract({ ...validFiles(), identity: validFiles().identity.replace("2026-09-01", "2026-02-31") }).some((issue) => /effective date/.test(issue)));
});

/** The same scopes written in all four places: both tomls and the SCOPES var of each wrangler environment. */
function withScopes(files, production, development = production) {
  files.productionToml = files.productionToml.replace('scopes = ""', `scopes = "${production}"`);
  files.developmentToml = files.developmentToml.replace('scopes = ""', `scopes = "${development}"`);
  files.wrangler.env.production.vars.SCOPES = production;
  files.wrangler.vars.SCOPES = development;
  return files;
}

test("accepts a scope that is in both tomls and in both SCOPES vars, in any order", () => {
  assert.deepEqual(validateLaunchContract(withScopes(validFiles(), "read_products,write_products")), []);
  const reordered = withScopes(validFiles(), "read_products,write_products");
  reordered.wrangler.env.production.vars.SCOPES = "write_products, read_products";
  assert.deepEqual(validateLaunchContract(reordered), []);
});

test("refuses a scope that production and development do not share", () => {
  const issues = validateLaunchContract(withScopes(validFiles(), "read_products,write_products", "read_products"));
  assert.ok(issues.includes("scope drift between shopify.app.toml and shopify.app.dev.toml"));
});

test("refuses a toml whose scopes differ from the SCOPES var of the same environment", () => {
  const production = withScopes(validFiles(), "read_products");
  production.wrangler.env.production.vars.SCOPES = "";
  assert.ok(validateLaunchContract(production).includes("shopify.app.toml scopes differ from the SCOPES var of wrangler.jsonc env.production"));
  const development = withScopes(validFiles(), "read_products");
  development.wrangler.vars.SCOPES = "read_orders";
  assert.ok(validateLaunchContract(development).includes("shopify.app.dev.toml scopes differ from the top-level SCOPES var of wrangler.jsonc"));
});

test("reads the webhook API version from app/core/api-version.ts", () => {
  assert.equal(apiVersionOf("export const apiVersion = ApiVersion.October26;"), "2026-10");
  assert.equal(apiVersionOf("export const apiVersion = ApiVersion.January27;"), "2027-01");
  assert.equal(apiVersionOf("export const apiVersion = ApiVersion.Unstable;"), null);
  const bumped = validFiles();
  bumped.apiVersionSource = "export const apiVersion = ApiVersion.January27;";
  assert.deepEqual(validateLaunchContract(bumped).filter((issue) => /api_version/.test(issue)), [expectedVersionIssue("2027-01")]);
  const undated = validFiles();
  undated.apiVersionSource = "export const apiVersion = ApiVersion.Unstable;";
  assert.ok(validateLaunchContract(undated).some((issue) => /does not name a dated ApiVersion/.test(issue)));
});

const expectedVersionIssue = (version) => `webhook api_version must be ${version} (app/core/api-version.ts) in both shopify.app.toml and shopify.app.dev.toml`;

test("refuses a webhook api_version that differs between the tomls or from api-version.ts, and an app URL that is not https", () => {
  const production = validFiles();
  production.productionToml = production.productionToml.replace("2026-10", "2026-04");
  assert.ok(validateLaunchContract(production).includes(expectedVersionIssue("2026-10")));
  const development = validFiles();
  development.developmentToml = development.developmentToml.replace("2026-10", "2026-04");
  assert.ok(validateLaunchContract(development).includes(expectedVersionIssue("2026-10")));
  const http = validFiles();
  http.wrangler.env.production.vars.SHOPIFY_APP_URL = "http://app.example.org";
  assert.ok(validateLaunchContract(http).includes("SHOPIFY_APP_URL must be an https:// URL"));
});

test("does not require production to re-declare the local-only TURNSTILE_SECRET_KEY slot", () => {
  const files = validFiles();
  files.wrangler.vars = { ...files.wrangler.vars, TURNSTILE_SECRET_KEY: "" };
  assert.deepEqual(validateLaunchContract(files), []);
});

test("warns, without blocking, when the support form has no bot check configured or the App Store handle is empty", () => {
  const files = validFiles();
  files.wrangler.env.production.vars.TURNSTILE_SITE_KEY = "";
  files.wrangler.env.production.vars.SHOPIFY_APP_HANDLE = "";
  const warnings = launchWarnings(files);
  assert.ok(warnings.some((warning) => /TURNSTILE_SITE_KEY/.test(warning)));
  assert.ok(warnings.some((warning) => /SHOPIFY_APP_HANDLE is empty/.test(warning)));
  assert.deepEqual(validateLaunchContract(files).filter((issue) => /TURNSTILE|HANDLE/.test(issue)), []);
});

test("the repo's own scopes and webhook version agree in the tomls, wrangler.jsonc and app/core/api-version.ts", () => {
  const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const files = {
    ...validFiles(),
    wrangler: JSON.parse(stripJsonComments(read("wrangler.jsonc"))),
    productionToml: read("shopify.app.toml"),
    developmentToml: read("shopify.app.dev.toml"),
    apiVersionSource: read("app/core/api-version.ts"),
  };
  assert.deepEqual(validateLaunchContract(files).filter((issue) => /scope|api_version|ApiVersion/.test(issue)), []);
});

test("refuses a production that is not on one custom domain: REPLACE_ME, workers.dev, preview URLs, another host", () => {
  const placeholder = validFiles();
  placeholder.wrangler.env.production.routes = [{ pattern: "REPLACE_ME", custom_domain: true }];
  assert.ok(validateLaunchContract(placeholder).includes("Cloudflare production binding contains placeholder values"));
  assert.equal(validateLaunchContract(placeholder).filter((issue) => /routes/.test(issue)).length, 0);
  const elsewhere = validFiles();
  elsewhere.wrangler.env.production.routes = [{ pattern: "other.example.org", custom_domain: true }];
  assert.ok(validateLaunchContract(elsewhere).some((issue) => /no custom domain "app\.example\.org"/.test(issue)));
  const missing = validFiles();
  delete missing.wrangler.env.production.routes;
  assert.ok(validateLaunchContract(missing).some((issue) => /env\.production\.routes must be/.test(issue)));
  const notCustom = validFiles();
  notCustom.wrangler.env.production.routes = [{ pattern: "app.example.org/*", zone_name: "example.org" }];
  assert.ok(validateLaunchContract(notCustom).some((issue) => /env\.production\.routes must be/.test(issue)));
  const devUrls = validFiles();
  delete devUrls.wrangler.env.production.workers_dev;
  devUrls.wrangler.env.production.preview_urls = true;
  const issues = validateLaunchContract(devUrls);
  assert.ok(issues.includes("wrangler.jsonc env.production.workers_dev must be false"));
  assert.ok(issues.includes("wrangler.jsonc env.production.preview_urls must be false"));
});

test("the webhook queues are exactly <slug>-webhooks and <slug>-webhooks-prod, with their dead-letter queues", () => {
  assert.deepEqual(queueNameIssues(validFiles().wrangler, "useful-app"), []);
  const other = validFiles();
  other.wrangler.env.production.queues.producers[0].queue = "queue";
  other.wrangler.env.production.queues.consumers[0].queue = "queue";
  assert.match(validateLaunchContract(other).join("\n"), /env\.production: the WEBHOOK_QUEUE producer must be "useful-app-webhooks-prod"/);
  assert.match(validateLaunchContract(other).join("\n"), /env\.production: the only queue consumer must be "useful-app-webhooks-prod"/);
  const topLevel = validFiles();
  topLevel.wrangler.queues.producers[0].queue = "my-app-webhooks";
  assert.match(validateLaunchContract(topLevel).join("\n"), /top level: the WEBHOOK_QUEUE producer must be "useful-app-webhooks"/);
  const dlq = validFiles();
  dlq.wrangler.env.production.queues.consumers[0].dead_letter_queue = "useful-app-webhooks-dlq";
  assert.match(validateLaunchContract(dlq).join("\n"), /dead-letter queue of "useful-app-webhooks-prod" must be "useful-app-webhooks-dlq-prod"/);
  const two = validFiles();
  two.wrangler.queues.consumers.push({ queue: "portal-events", max_retries: 1, dead_letter_queue: "x" });
  assert.match(validateLaunchContract(two).join("\n"), /top level: the only queue consumer/);
  assert.ok(queueNameIssues(validFiles().wrangler, null)[0].includes("no slug"));
  // A declared dead-letter queue is optional to this check (the bindings test requires one separately).
  const noDlq = validFiles();
  delete noDlq.wrangler.env.production.queues.consumers[0].dead_letter_queue;
  assert.deepEqual(queueNameIssues(noDlq.wrangler, "useful-app"), []);
});

test("both tomls subscribe the same webhook topics at the same /webhooks/ URIs", () => {
  const files = validFiles();
  assert.deepEqual(webhookSubscriptionIssues(files.productionToml, files.developmentToml), []);

  // `shopify app config link` rewrote the dev toml and dropped the subscriptions (it happened in testing).
  const dropped = validFiles();
  dropped.developmentToml = dropped.developmentToml.replace(SUBSCRIPTIONS, "");
  const droppedIssues = validateLaunchContract(dropped).join("\n");
  assert.match(droppedIssues, /shopify\.app\.dev\.toml: no webhook subscription for app\/uninstalled/);
  assert.match(droppedIssues, /shopify\.app\.dev\.toml: no webhook subscription for compliance shop\/redact/);
  assert.match(droppedIssues, /shopify\.app\.dev\.toml lacks the webhook subscription app\/uninstalled/);
  const extra = validFiles();
  extra.developmentToml = extra.developmentToml.replace("[access_scopes]", '  [[webhooks.subscriptions]]\n  topics = [ "orders/create" ]\n  uri = "/webhooks/orders"\n\n[access_scopes]');
  assert.match(validateLaunchContract(extra).join("\n"), /shopify\.app\.toml lacks the webhook subscription orders\/create -> \/webhooks\/orders/);

  const moved = validFiles();
  moved.developmentToml = moved.developmentToml.replace("/webhooks/compliance", "/webhooks/gdpr");
  assert.match(validateLaunchContract(moved).join("\n"), /shopify\.app\.dev\.toml lacks the webhook subscription compliance customers\/redact -> \/webhooks\/compliance/);

  const foreign = validFiles();
  foreign.productionToml = foreign.productionToml.replace("/webhooks/app/uninstalled", "/api/uninstalled");
  assert.match(validateLaunchContract(foreign).join("\n"), /uri "\/api\/uninstalled" must start with \/webhooks\//);
});

test("both tomls keep their [build] flags: dev follows the tunnel, production does not, both deploy their config", () => {
  const files = validFiles();
  assert.deepEqual(buildFlagIssues(files.productionToml, files.developmentToml), []);
  const linked = validFiles();
  linked.developmentToml = linked.developmentToml.replace(/\[build\][\s\S]*$/, "");
  const issues = validateLaunchContract(linked);
  assert.ok(issues.includes("shopify.app.dev.toml: [build] include_config_on_deploy must be true (did `shopify app config link` drop it?)"));
  assert.ok(issues.includes("shopify.app.dev.toml: [build] automatically_update_urls_on_dev must be true (did `shopify app config link` drop it?)"));
  const tracking = validFiles();
  tracking.productionToml = tracking.productionToml.replace("automatically_update_urls_on_dev = false", "automatically_update_urls_on_dev = true");
  assert.ok(validateLaunchContract(tracking).includes("shopify.app.toml: [build] automatically_update_urls_on_dev must be false (did `shopify app config link` drop it?)"));
});

test("the repo's own tomls and wrangler.jsonc pass the webhook, build-flag and queue-name checks", () => {
  const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const files = { ...validFiles(), wrangler: JSON.parse(stripJsonComments(read("wrangler.jsonc"))), productionToml: read("shopify.app.toml"), developmentToml: read("shopify.app.dev.toml"), identity: read("app/core/identity.ts") };
  const issues = validateLaunchContract(files).filter((issue) => /webhook subscription|\[build\]|uri "|queue|dead-letter|workers_dev|preview_urls/.test(issue));
  assert.deepEqual(issues, []);
});
