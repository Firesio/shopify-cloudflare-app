#!/usr/bin/env node
// Turn a fresh copy of the template into a new app: ONE command renames it everywhere and prints the Cloudflare resources to
// create. It creates nothing: no `wrangler`, no `shopify`, no network. Run it once, in the new repo, before the first commit.
//
//   npm run new-app -- <slug> "<Display Name>"
//   npm run new-app -- repair-service-ops "Repair Service Ops"
//
// The slug is OUR OWN name for the app (lower case, hyphens): the `appSlug` on every event, the Worker's name and the prefix of
// its Cloudflare resources. It is never Shopify's app id. The same slug is declared in the portal (one PR to the Firesio
// platform repo: docs/ADOPTING_THE_TEMPLATE.md section 5 has the steps; it prints the one value that depends on the slug).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEMPLATE_SLUG = "my-app";
const TEMPLATE_NAME = "TODO: Your App Name";
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Why a slug or a name cannot be used, or null. */
export function inputProblem(slug, name) {
  if (!SLUG.test(slug) || slug.length < 3 || slug.length > 40) return "the slug must be 3 to 40 characters: lower-case letters, digits and single hyphens, starting with a letter";
  if (slug === TEMPLATE_SLUG) return `the slug must differ from the template's "${TEMPLATE_SLUG}"`;
  if (slug.startsWith("gid") || /^\d+$/.test(slug)) return "the slug must be our own name for the app, not a Shopify id";
  if (name.trim() === "" || /[\n\r"\\]/.test(name)) return "the display name must be one line without quotes or backslashes";
  return null;
}

/**
 * One substitution in `file`: `from` (a RegExp, or a string for its first occurrence) becomes `to`. `to` is inserted literally:
 * a display name holding `$&` or `$1` must come out as typed.
 */
function replace(file, from, to) {
  return { file, from, to };
}

/**
 * Every place the template names itself, as data: the file and what to put there. The resource names are the template's
 * defaults (`app-db`, `my-app-webhooks`, `my-app-jobs`, ...): they become `<slug>-db`, `<slug>-webhooks`, ... (queue, bucket and database
 * names are per account, so two apps must not share one). `portal-events` is shared with the portal and is NEVER renamed.
 */
export function renames(slug, name) {
  const resources = [
    [/\bapp-support-uploads\b/g, `${slug}-support-uploads`],
    [/\bmy-app-webhooks\b/g, `${slug}-webhooks`],
    [/\bmy-app-jobs\b/g, `${slug}-jobs`],
    [/\bmy-app-notify\b/g, `${slug}-notify`],
    [/\bmy-app-mail-events\b/g, `${slug}-mail-events`],
    [/\bmy-app-flows\b/g, `${slug}-flows`],
    [/\bmy-app-usage\b/g, `${slug}-usage`],
    [/\bapp-db\b/g, `${slug}-db`],
  ];
  const withResources = (file) => resources.map(([from, to]) => replace(file, from, to));
  return [
    replace("app/core/identity.ts", `slug: "${TEMPLATE_SLUG}"`, `slug: "${slug}"`),
    replace("app/core/identity.ts", new RegExp(`"${TEMPLATE_NAME}"`, "g"), `"${name}"`),
    replace("wrangler.jsonc", `"name": "shopify-cloudflare-app"`, `"name": "${slug}"`),
    ...withResources("wrangler.jsonc"),
    replace("package.json", `"name": "shopify-cloudflare-app"`, `"name": "${slug}"`),
    ...withResources("docs/OPERATIONS.md"),
    ...withResources("docs/webhooks.md"),
    replace("shopify.web.toml", `name = "shopify-cloudflare-app"`, `name = "${slug}"`),
    replace("shopify.app.toml", `name = "My App"`, `name = "${name}"`),
    replace("shopify.app.dev.toml", /^name = ".*"$/m, `name = "${name} (dev)"`),
    // The template ships no client id (an id of someone else's app would be linked by mistake): `npm run config:link:*` fills them.
    replace("shopify.app.toml", /^client_id = ".*"$/m, 'client_id = ""'),
    replace("shopify.app.dev.toml", /^client_id = ".*"$/m, 'client_id = ""'),
  ];
}

/** Applies the substitutions under `root`; the list of files that changed. A file that is not there is skipped and reported. */
export function applyRenames(root, slug, name) {
  const changed = new Set();
  const missing = new Set();
  for (const { file, from, to } of renames(slug, name)) {
    const path = join(root, file);
    if (!existsSync(path)) {
      missing.add(file);
      continue;
    }
    const before = readFileSync(path, "utf8");
    const after = before.replace(from, () => to);
    if (after !== before) {
      writeFileSync(path, after);
      changed.add(file);
    }
  }
  return { changed: [...changed], missing: [...missing] };
}

/** How the portal learns about the app: ONE pull request to the Firesio platform repo (the review is the approval; there is no Register button). */
export function portalRegistration(slug) {
  return [
    `Register "${slug}" with the portal: ONE PR to the Firesio platform repo (until it merges and deploys, the portal lists the app as pending and stores none of its events).`,
    `  The binding to add there points at this repo's production Worker: { "binding": "<KEY>", "service": "${slug}-production", "entrypoint": "AdminApi" }`,
    `  ("${slug}-production" is the "name" of wrangler.jsonc, set to "${slug}" above, plus "-production"). The steps: docs/ADOPTING_THE_TEMPLATE.md, section 5.`,
  ].join("\n");
}

/** What to create in Cloudflare and Shopify for the app, as shell commands and notes. Nothing here is executed. */
export function resourcesFor(slug) {
  return [
    "Cloudflare (create each once; put the ids in wrangler.jsonc under env.production, the top level only needs placeholders):",
    `  npx wrangler d1 create ${slug}-db-prod`,
    `  npx wrangler kv namespace create SESSION --env production      (the id goes in env.production.kv_namespaces[SESSION])`,
    `  npx wrangler r2 bucket create ${slug}-support-uploads-prod`,
    ...["webhooks", "jobs", "notify", "mail-events"].flatMap((role) => [
      `  npx wrangler queues create ${slug}-${role}-prod --message-retention-period-secs 1209600`,
      `  npx wrangler queues create ${slug}-${role}-dlq-prod --message-retention-period-secs 1209600`,
    ]),
    "  (the Workflow ${slug}-flows-prod, the Durable Object ShopCoordinator and the Analytics Engine dataset are created by the deploy itself)".replace("${slug}", slug),
    "",
    "Shared with the portal (already exist; never create or rename them):",
    "  queue portal-events-prod (this app is a producer; its dead-letter queue is the portal's consumer side)",
    "  KV namespace for the portal's blocklist (bind its id as PORTAL_BLOCKLIST under env.production)",
    "",
    "Secrets (wrangler secret put <NAME> --env production):",
    "  SHOPIFY_API_SECRET, ATTACHMENT_TOKEN_SECRET, EVENT_HASH_SECRET (the portal's shared key), PARTNER_API_TOKEN, NOTIFY_SECRET (32+ characters: openssl rand -base64 32), TURNSTILE_SECRET_KEY (optional)",
    "",
    "Then:",
    "  1. Email Routing: route support@<your domain> to this Worker; onboard the domain to Email Sending (notification@ and support@ it), then subscribe the mail-events queue to its events (docs/OPERATIONS.md, \"Mail\").",
    "  2. Ratelimit namespace_id values in wrangler.jsonc are unique per ACCOUNT: change 1001, 1004, 1005 if another app uses them.",
    "  3. npm run config:link:dev, then npm run config:link:prod (both fill client_id), then npm run check:placeholders until it passes.",
    "",
    portalRegistration(slug),
  ].join("\n");
}

export const USAGE = [
  'usage: npm run new-app -- <slug> "<Display Name>"',
  '       npm run new-app -- repair-service-ops "Repair Service Ops"',
  "",
  "Renames a fresh copy of the template everywhere (identity, Worker, resource names, both Shopify configs), blanks both client_id",
  "values and prints the Cloudflare resources to create. It creates nothing and runs once per repo.",
].join("\n");

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }
  const [slug, name] = args;
  if (slug === undefined || name === undefined) {
    console.error(USAGE);
    process.exit(2);
  }
  const problem = inputProblem(slug, name);
  if (problem !== null) {
    console.error(`new-app: ${problem}`);
    process.exit(2);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const identity = readFileSync(join(root, "app/core/identity.ts"), "utf8");
  if (!identity.includes(`slug: "${TEMPLATE_SLUG}"`)) {
    console.error("new-app: this repo is already named (app/core/identity.ts no longer has the template's slug). It renames a fresh template copy once.");
    process.exit(1);
  }
  const { changed, missing } = applyRenames(root, slug, name);
  console.log(`Renamed to "${slug}" / "${name}" in ${changed.length} files:\n  ${changed.join("\n  ")}`);
  if (missing.length > 0) console.warn(`\nNot found (skipped): ${missing.join(", ")}`);
  console.log(`\n${resourcesFor(slug)}\n\nNothing was created: this script only edits files.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
