import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { databaseName, stripJsonComments } from "./wrangler-config.mjs";
import { applyRenames, inputProblem, portalRegistration, renames, resourcesFor } from "./new-app.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

/** A scratch copy of the files the script edits: the real ones, so a rename that stops matching shows up here. */
function scratch() {
  const root = mkdtempSync(join(tmpdir(), "new-app-"));
  for (const file of new Set(renames("probe", "Probe").map((entry) => entry.file))) {
    if (!existsSync(join(repo, file))) continue;
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(repo, file), join(root, file));
  }
  return root;
}

const read = (root, file) => readFileSync(join(root, file), "utf8");

test("refuses a slug the contract or Cloudflare would not accept, and the template's own", () => {
  for (const slug of ["My-App", "ab", "-lead", "trail-", "two--hyphens", "123456", "gid-shopify", "my-app", "x".repeat(41), "has space"]) {
    assert.notEqual(inputProblem(slug, "Name"), null, slug);
  }
  assert.equal(inputProblem("repair-service-ops", "Repair Service Ops"), null);
  assert.notEqual(inputProblem("good-slug", "  "), null);
  assert.notEqual(inputProblem("good-slug", 'Quote " here'), null);
});

test("renames the slug, the display name and every resource name in one run", () => {
  const root = scratch();
  const { changed, missing } = applyRenames(root, "repair-ops", "Repair Ops");
  assert.deepEqual(missing, []);
  assert.match(read(root, "app/core/identity.ts"), /slug: "repair-ops"/);
  assert.match(read(root, "app/core/identity.ts"), /name: "Repair Ops"/);
  const wrangler = read(root, "wrangler.jsonc");
  assert.match(wrangler, /"name": "repair-ops"/);
  for (const name of ["repair-ops-db", "repair-ops-db-prod", "repair-ops-support-uploads", "repair-ops-webhooks", "repair-ops-webhooks-dlq-prod", "repair-ops-campaigns", "repair-ops-campaigns-dlq", "repair-ops-campaigns-prod", "repair-ops-campaigns-prod-dlq"]) assert.ok(wrangler.includes(`"${name}"`), name);
  // The migration scripts read the database names from wrangler.jsonc: nothing else names them.
  assert.equal(databaseName(JSON.parse(stripJsonComments(wrangler)), "production"), "repair-ops-db-prod");
  assert.equal(databaseName(JSON.parse(stripJsonComments(wrangler)), ""), "repair-ops-db");
  assert.doesNotMatch(read(root, "package.json"), /--database/);
  // The preset derives the consumed queues from identity.slug: the config names no queue, and the script does not edit it.
  assert.doesNotMatch(readFileSync(join(repo, "app/firesio.server.ts"), "utf8"), /webhookQueues|-webhooks/);
  assert.match(read(root, "shopify.app.toml"), /name = "Repair Ops"/);
  assert.ok(!changed.includes("scripts/ci-release.mjs"));
});

test("leaves nothing of the template's names behind in the files it edits", () => {
  const root = scratch();
  applyRenames(root, "repair-ops", "Repair Ops");
  for (const file of ["wrangler.jsonc", "package.json", "shopify.web.toml", "shopify.app.toml", "app/core/identity.ts"]) {
    const text = read(root, file);
    assert.doesNotMatch(text, /shopify-cloudflare-app|"app-db|app-support-uploads|"my-app-webhooks|TODO: Your App Name|"my-app"/, file);
  }
});

test("never renames the queue it shares with the portal", () => {
  const root = scratch();
  applyRenames(root, "repair-ops", "Repair Ops");
  const wrangler = read(root, "wrangler.jsonc");
  assert.ok(wrangler.includes('"queue": "portal-events"'));
  assert.ok(wrangler.includes('"queue": "portal-events-prod"'));
});

test("lists the resources to create and creates none of them", () => {
  const text = resourcesFor("repair-ops");
  for (const command of ["d1 create repair-ops-db-prod", "r2 bucket create repair-ops-support-uploads-prod", "queues create repair-ops-webhooks-prod", "queues create repair-ops-webhooks-dlq-prod"]) {
    assert.ok(text.includes(command), command);
  }
  assert.match(text, /portal-events-prod/);
  const source = readFileSync(join(repo, "scripts/new-app.mjs"), "utf8");
  assert.doesNotMatch(source, /child_process|spawn|exec(File)?Sync|fetch\(/);
});

test("blanks the client id of both Shopify configs, whatever a copy still carries", () => {
  const root = scratch();
  for (const file of ["shopify.app.toml", "shopify.app.dev.toml"]) {
    writeFileSync(join(root, file), read(root, file).replace(/^client_id = ".*"$/m, 'client_id = "0123456789abcdef"'));
  }
  applyRenames(root, "repair-ops", "Repair Ops");
  for (const file of ["shopify.app.toml", "shopify.app.dev.toml"]) assert.match(read(root, file), /^client_id = ""$/m, file);
});

test("the template itself ships no client id in either Shopify config", () => {
  for (const file of ["shopify.app.toml", "shopify.app.dev.toml"]) assert.match(readFileSync(join(repo, file), "utf8"), /^client_id = ""$/m, file);
});

test("inserts a display name literally: $&, $1 and $$ are not replacement patterns", () => {
  const root = scratch();
  const name = "Pay $& Go $1 $$ $`";
  applyRenames(root, "repair-ops", name);
  assert.ok(read(root, "app/core/identity.ts").includes(`"${name}"`));
  assert.ok(read(root, "shopify.app.toml").includes(`name = "${name}"`));
  assert.ok(read(root, "shopify.app.dev.toml").includes(`name = "${name} (dev)"`));
});

test("--help prints the usage and exits 0 without touching a file", () => {
  const result = spawnSync(process.execPath, [join(repo, "scripts/new-app.mjs"), "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /usage: npm run new-app -- <slug>/);
  const missing = spawnSync(process.execPath, [join(repo, "scripts/new-app.mjs")], { encoding: "utf8" });
  assert.equal(missing.status, 2);
});

test("says the portal registration is one PR to the platform repo, with the Worker name the binding points at and where the steps are", () => {
  const text = portalRegistration("repair-ops");
  assert.match(text, /ONE PR to the Firesio platform repo/);
  assert.match(text, /"service": "repair-ops-production", "entrypoint": "AdminApi"/);
  assert.match(text, /docs\/ADOPTING_THE_TEMPLATE\.md, section 5/);
  // The steps themselves live in one place (the adoption checklist), not here.
  assert.doesNotMatch(text, /declared-apps\.ts|campaigns/);
  assert.doesNotMatch(resourcesFor("repair-ops"), /\/apps page/);
  assert.ok(resourcesFor("repair-ops").includes(text));
});
