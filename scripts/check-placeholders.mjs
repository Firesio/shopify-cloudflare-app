#!/usr/bin/env node
// Pre-deploy guard: refuse to deploy an environment whose bindings still hold
// placeholder ids.
//
//   node scripts/check-placeholders.mjs production
//
// A fresh project copies wrangler.jsonc, fills in some ids and forgets others.
// Without this, `wrangler deploy` succeeds and ships a Worker whose D1 and KV
// point at nothing — which fails at RUNTIME, on a real request, with an error
// that says nothing about the cause. Cheap to check, expensive to discover.
//
// Wired into `cf:deploy` before the build, so it fails in seconds rather than
// after a full verify.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { PLACEHOLDER, buildFlagIssues, productionRouteIssues, queueNameIssues, slugOf, webhookSubscriptionIssues } from "./launch-config-checks.mjs";
import { tomlSectionString, tomlString, tomlStrings } from "./toml-lite.mjs";
import { configForEnv, stripJsonComments } from "./wrangler-config.mjs";

export { configForEnv, stripJsonComments };

/** Same rule as HANDLE_PATTERN in `installTarget` of `@firesio/app/shell` (this script cannot import TypeScript). */
const APP_HANDLE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Every placeholder string inside `value`, as `path → value` pairs.
 *
 * Walks the PARSED object rather than scanning lines: line scanning cannot tell
 * which environment a line belongs to, and a comment mentioning REPLACE_ME
 * (there are several, explaining what to do) would be a false positive.
 */
export function findPlaceholders(value, path = "") {
  if (typeof value === "string") {
    return PLACEHOLDER.test(value) ? [{ path, value }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => findPlaceholders(item, `${path}[${i}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      findPlaceholders(item, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

const BINDING_SECTIONS = [
  ["ai", "binding"],
  ["analytics_engine_datasets", "binding"],
  ["browser", "binding"],
  ["d1_databases", "binding"],
  ["durable_objects", "bindings", "name"],
  ["hyperdrive", "binding"],
  ["images", "binding"],
  ["kv_namespaces", "binding"],
  ["queues", "producers", "binding"],
  ["r2_buckets", "binding"],
  ["ratelimits", "name"],
  ["send_email", "name"],
  ["services", "binding"],
  ["vectorize", "binding"],
  ["version_metadata", "binding"],
  ["workflows", "binding"],
];

export function bindingKeys(config) {
  return new Set(BINDING_SECTIONS.flatMap(([section, nested, key]) => {
    const entries = key ? config[section]?.[nested] : config[section];
    if (Array.isArray(entries)) return entries.map((entry) => entry[key ?? nested]).filter(Boolean);
    if (entries && typeof entries === "object") return [entries[key ?? nested]].filter(Boolean);
    return [];
  }));
}

/**
 * Top-level vars that production must NOT re-declare. TURNSTILE_SECRET_KEY is an empty slot so wrangler loads them from .dev.vars
 * locally; in production it is a secret, and a var of the same name would
 * shadow it.
 */
const LOCAL_ONLY_VARS = new Set(["TURNSTILE_SECRET_KEY"]);

function parityIssues(base, production) {
  const issues = [];
  for (const key of bindingKeys(base)) {
    if (!bindingKeys(production).has(key)) issues.push(`production binding ${key} is missing`);
  }
  for (const key of Object.keys(base.vars ?? {})) {
    if (LOCAL_ONLY_VARS.has(key)) continue;
    if (!(key in (production.vars ?? {}))) issues.push(`production var ${key} is missing`);
  }
  for (const key of base.secrets?.required ?? []) {
    if (!production.secrets?.required?.includes(key)) issues.push(`production secret ${key} is missing`);
  }
  const baseConsumers = base.queues?.consumers ?? [];
  const productionConsumers = production.queues?.consumers ?? [];
  if (productionConsumers.length < baseConsumers.length) {
    issues.push(`production queue consumer configuration is missing (${baseConsumers.length} required)`);
  }
  return issues;
}

/** A scopes string as the set Shopify treats it as: order and spacing do not matter. */
function scopeSet(value) {
  return [...new Set(String(value ?? "").split(",").map((scope) => scope.trim()).filter(Boolean))].sort();
}

const sameSet = (a, b) => a.length === b.length && a.every((scope, i) => scope === b[i]);

/**
 * Scopes are one decision written in four places: both tomls (what Shopify grants) and the `SCOPES` var of each wrangler
 * environment (what the Worker asks for at token exchange). A scope that exists in only one of them is a bug that reproduces
 * in only one environment, so every pair must agree. A template with no scopes is fine: an app adds the ones it uses.
 */
function scopeIssues(files, production) {
  const issues = [];
  const productionToml = scopeSet(tomlString(files.productionToml, "scopes"));
  const developmentToml = scopeSet(tomlString(files.developmentToml, "scopes"));
  if (!sameSet(productionToml, developmentToml)) issues.push("scope drift between shopify.app.toml and shopify.app.dev.toml");
  if (!sameSet(productionToml, scopeSet(production.vars?.SCOPES))) issues.push("shopify.app.toml scopes differ from the SCOPES var of wrangler.jsonc env.production");
  if (!sameSet(developmentToml, scopeSet(files.wrangler.vars?.SCOPES))) issues.push("shopify.app.dev.toml scopes differ from the top-level SCOPES var of wrangler.jsonc");
  return issues;
}

/** Where the package states its Admin API version (this script cannot import TypeScript): the file is read, never the string typed here. */
export const API_VERSION_FILE = "node_modules/@firesio/app/src/shell/api-version.ts";

/** The webhook API version `ADMIN_API_VERSION` of `@firesio/app/shell` names (`export const ADMIN_API_VERSION = "2026-10";`), or null when it is not a dated one. */
export function apiVersionOf(source) {
  return /ADMIN_API_VERSION\s*=\s*"(\d{4}-\d{2})"/.exec(source ?? "")?.[1] ?? null;
}

/**
 * The Admin API / webhook version is ONE decision: the package's default (`ADMIN_API_VERSION`, which `createFiresio({ shopify: { apiVersion } })` follows
 * unless the app chooses another) and `api_version` in both tomls.
 */
function webhookVersionIssues(files) {
  const supported = apiVersionOf(files.apiVersionSource);
  if (supported === null) return [`${API_VERSION_FILE} does not name a dated ADMIN_API_VERSION (for example "2026-10")`];
  const versions = [files.productionToml, files.developmentToml].map((toml) => tomlSectionString(toml, "webhooks", "api_version"));
  return versions.every((version) => version === supported) ? [] : [`webhook api_version must be ${supported} (ADMIN_API_VERSION of @firesio/app/shell) in both shopify.app.toml and shopify.app.dev.toml`];
}

export function validateLaunchContract(files) {
  const issues = [];
  const production = configForEnv(files.wrangler, "production");
  if (!production) return ['No "production" environment in wrangler.jsonc'];
  issues.push(...parityIssues(configForEnv(files.wrangler, "top-level"), production));
  if (findPlaceholders(production).length > 0) issues.push("Cloudflare production binding contains placeholder values");

  const vars = production.vars ?? {};
  for (const key of ["SHOPIFY_API_KEY", "SHOPIFY_APP_URL", "PARTNER_APP_ID", "PARTNER_ORG_ID", "EVENT_HASH_KEY_ID"]) {
    if (!vars[key] || PLACEHOLDER.test(vars[key]) || vars[key] === "https://example.com") {
      issues.push(`${key} is missing or placeholder`);
    }
  }
  for (const secret of ["PARTNER_API_TOKEN", "ATTACHMENT_TOKEN_SECRET", "EVENT_HASH_SECRET", "NOTIFY_SECRET"]) {
    if (!(production.secrets?.required ?? []).includes(secret)) issues.push(`${secret} secret is not declared`);
  }

  const requiredBindings = [
    ["SESSION", "kv_namespaces"], ["PORTAL_BLOCKLIST", "kv_namespaces"], ["DB", "d1_databases"], ["UPLOADS", "r2_buckets"],
    ["EMAIL", "send_email"], ["AI", "ai"], ["WEBHOOK_QUEUE", "queues"], ["JOBS_QUEUE", "queues"], ["NOTIFY_QUEUE", "queues"], ["PORTAL_EVENTS", "queues"],
    ["FLOWS", "workflows"], ["SHOP_COORDINATOR", "durable_objects"], ["USAGE", "analytics_engine_datasets"], ["CF_VERSION_METADATA", "version_metadata"],
    ["SUPPORT_LIMITER", "ratelimits"], ["SUPPORT_FORM_LIMITER", "ratelimits"], ["SUPPORT_MAIL_LIMITER", "ratelimits"],
  ];
  for (const [binding, section] of requiredBindings) {
    const configured = section === "ai"
      ? production.ai?.binding === binding
      : section === "queues"
        ? production.queues?.producers?.some((entry) => entry.binding === binding)
        : section === "ratelimits"
          ? production.ratelimits?.some((entry) => entry.name === binding)
          : section === "durable_objects"
            ? production.durable_objects?.bindings?.some((entry) => entry.name === binding)
            : section === "version_metadata"
              ? production.version_metadata?.binding === binding
              : production[section]?.some((entry) => entry.binding === binding || entry.name === binding);
    if (!configured) issues.push(`production binding ${binding} is missing`);
  }
  // The portal consumes the events queue (and owns its DLQ); this Worker consumes its own queues (`queueNameIssues` holds the names).
  for (const binding of ["WEBHOOK_QUEUE", "JOBS_QUEUE", "NOTIFY_QUEUE"]) {
    const queue = production.queues?.producers?.find((entry) => entry.binding === binding)?.queue;
    if (!queue || !production.queues?.consumers?.some((entry) => entry.queue === queue)) issues.push(`production ${binding} consumer is missing`);
  }
  // The shop coordinator is a SQLite-backed Durable Object: without its migration the class cannot be created.
  if (!(production.migrations ?? []).some((migration) => (migration.new_sqlite_classes ?? []).includes("ShopCoordinator"))) issues.push("production migrations must create the ShopCoordinator class (new_sqlite_classes)");
  // Named-env triggers are not inherited, and these two strings are decisions shared with the preset (`@firesio/app`, preset/worker/cron.ts; scripts/wrangler-bindings.test.mjs pins them):
  // without the drain-only cron the outbox is sent once a day, without the daily one the snapshot never runs.
  const crons = production.triggers?.crons ?? [];
  if (!crons.includes("* * * * *")) issues.push('production triggers.crons must include the outbox drain cron "* * * * *"');
  if (!crons.includes("30 3 * * *")) issues.push('production triggers.crons must include the daily cron "30 3 * * *"');

  const clientId = tomlString(files.productionToml, "client_id");
  const appUrl = tomlString(files.productionToml, "application_url");
  const redirects = tomlStrings(files.productionToml, "redirect_urls");
  if (!clientId || PLACEHOLDER.test(clientId)) issues.push("shopify.app.toml client_id is missing or placeholder");
  if (!appUrl || PLACEHOLDER.test(appUrl) || appUrl === "https://example.com") issues.push("shopify.app.toml application_url is placeholder");
  if (redirects.length !== 1 || redirects[0] !== `${appUrl}/auth/callback`) issues.push("shopify.app.toml redirect_urls drift from application_url");
  // App Store 3.1.1: the app is served over TLS. A plain-http production URL
  // would put session tokens and merchant data on the wire in clear text.
  if (vars.SHOPIFY_APP_URL && !isHttpsUrl(vars.SHOPIFY_APP_URL)) issues.push("SHOPIFY_APP_URL must be an https:// URL");
  if (appUrl && !isHttpsUrl(appUrl)) issues.push("shopify.app.toml application_url must be an https:// URL");
  if (vars.SHOPIFY_APP_URL && appUrl && vars.SHOPIFY_APP_URL !== appUrl) issues.push("SHOPIFY_APP_URL drifts from shopify.app.toml application_url");
  if (vars.SHOPIFY_API_KEY && clientId && vars.SHOPIFY_API_KEY !== clientId) issues.push("SHOPIFY_API_KEY drifts from shopify.app.toml client_id");

  issues.push(...scopeIssues(files, production));
  issues.push(...webhookVersionIssues(files));
  issues.push(...webhookSubscriptionIssues(files.productionToml, files.developmentToml));
  issues.push(...buildFlagIssues(files.productionToml, files.developmentToml));
  issues.push(...productionRouteIssues(production));
  issues.push(...queueNameIssues(files.wrangler, slugOf(files.identity)));
  const identitySource = files.identity ?? "";
  const requiredIdentity = ["slug", "name", "companyName", "supportEmail", "address"];
  const missingIdentity = requiredIdentity.some((field) => new RegExp(`${field}\\s*:\\s*"[^"\\n]+"`).test(identitySource) === false);
  const effectiveDate = identitySource.match(/effectiveDate\s*:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1];
  const validDate = effectiveDate && !Number.isNaN(Date.parse(`${effectiveDate}T00:00:00Z`)) && new Date(`${effectiveDate}T00:00:00Z`).toISOString().startsWith(effectiveDate);
  if (PLACEHOLDER.test(files.legal) || PLACEHOLDER.test(identitySource) || missingIdentity || !validDate) {
    issues.push("legal identity/contact/date contains TODO or invalid effective date");
  }
  if (PLACEHOLDER.test(files.plans)) issues.push("app/core/plans.ts still has placeholder plan names, prices or limits");
  if (PLACEHOLDER.test(files.publicCopy)) issues.push("the public pages (landing, support, privacy, terms) contain TODO");
  for (const { path, source } of files.routeSources ?? []) {
    if (PLACEHOLDER.test(source)) issues.push(`${path} is still the template's placeholder page (it contains TODO): replace it with the app's own`);
  }
  return issues;
}

/**
 * Not blocking, but worth reading before a release. An empty handle is right
 * until the app has a listing: the manual shop-domain form is then the only way
 * in. Once listed, App Store requirement 2.3.1 forbids that form, and the handle
 * is what removes it (`installTarget` of `@firesio/app/shell`).
 */
export function launchWarnings(files) {
  const warnings = [];
  const handle = (configForEnv(files.wrangler, "production")?.vars?.SHOPIFY_APP_HANDLE ?? "").trim();
  if (handle === "") {
    warnings.push(
      "SHOPIFY_APP_HANDLE is empty: the landing page and /auth/login show a shop-domain form. " +
        "Set it before the release that goes live on the App Store (requirement 2.3.1).",
    );
  } else if (!APP_HANDLE.test(handle)) {
    warnings.push(`SHOPIFY_APP_HANDLE "${handle}" is not a valid App Store handle; the manual shop-domain form stays on.`);
  }
  const production = configForEnv(files.wrangler, "production")?.vars ?? {};
  if (typeof production.TURNSTILE_SITE_KEY === "string" && production.TURNSTILE_SITE_KEY.trim() === "") {
    warnings.push(
      "TURNSTILE_SITE_KEY is empty: the public support form is protected only by a rate limit and a decoy field. " +
        "Set it, and `wrangler secret put TURNSTILE_SECRET_KEY --env production`, before the form takes real traffic.",
    );
  }
  return warnings;
}

/** Every .ts/.tsx file under `dir`, as `{ path, source }` with repo-relative paths. */
function readSources(repoRoot, dir) {
  return readdirSync(join(repoRoot, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => {
      const full = join(entry.parentPath, entry.name);
      return { path: full.slice(repoRoot.length + 1), source: readFileSync(full, "utf8") };
    });
}

/**
 * The CLI. Wrapped in a function and guarded below so this module can be
 * IMPORTED by its tests — top-level `process.exit` would otherwise kill the test
 * runner the moment it loaded the file, and the alternative is testing a copy of
 * the parser rather than the parser that actually runs.
 */
function main() {
  const envName = process.argv[2];
  if (!envName) {
    console.error(
      "usage: node scripts/check-placeholders.mjs <env>   (e.g. production)",
    );
    process.exit(2);
  }

  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const raw = readFileSync(join(repoRoot, "wrangler.jsonc"), "utf8");

  let config;
  try {
    config = JSON.parse(stripJsonComments(raw));
  } catch (error) {
    console.error(`wrangler.jsonc could not be parsed: ${error.message}`);
    process.exit(2);
  }

  const envConfig = configForEnv(config, envName);
  if (!envConfig) {
    console.error(
      `No "${envName}" environment in wrangler.jsonc. Known: ${Object.keys(config.env ?? {}).join(", ") || "(none)"}`,
    );
    process.exit(2);
  }

  const files = {
    wrangler: config,
    productionToml: readFileSync(join(repoRoot, "shopify.app.toml"), "utf8"),
    developmentToml: readFileSync(join(repoRoot, "shopify.app.dev.toml"), "utf8"),
    legal: readSources(repoRoot, "app/routes/public/legal").map(({ source }) => source).join("\n") + readFileSync(join(repoRoot, "app/core/identity.ts"), "utf8"),
    identity: readFileSync(join(repoRoot, "app/core/identity.ts"), "utf8"),
    firesio: readFileSync(join(repoRoot, "app/firesio.server.ts"), "utf8"),
    apiVersionSource: readFileSync(join(repoRoot, API_VERSION_FILE), "utf8"),
    plans: readFileSync(join(repoRoot, "app/core/plans.ts"), "utf8"),
    publicCopy: ["landing", "support"].map((page) => readFileSync(join(repoRoot, `app/routes/public/${page}.tsx`), "utf8")).join("\n"),
    routeSources: [{ path: "app/routes/app/home.tsx", source: readFileSync(join(repoRoot, "app/routes/app/home.tsx"), "utf8") }],
  };
  for (const warning of launchWarnings(files)) console.warn(`warning: ${warning}`);
  const issues = validateLaunchContract(files);
  if (issues.length > 0) {
    console.error(
      `\nRefusing to deploy "${envName}": ${issues.length} launch contract issue${issues.length === 1 ? "" : "s"}\n`,
    );
    for (const issue of issues) console.error(`  ${issue}`);
    console.error(
      "\nFill these in first:\n" +
        "  npx wrangler d1 create <name>\n" +
        "  npx wrangler kv namespace create <BINDING>\n" +
        "then re-run `npm run cf-typegen`.\n",
    );
    process.exit(1);
  }

  console.log(`wrangler.jsonc "${envName}": no placeholder values.`);
}

// Only when run directly, never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
