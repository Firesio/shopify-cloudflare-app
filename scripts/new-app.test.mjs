import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { applyRenames, inputProblem, renames, resourcesFor } from "./new-app.mjs";

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
  for (const name of ["repair-ops-db", "repair-ops-db-prod", "repair-ops-support-uploads", "repair-ops-webhooks", "repair-ops-webhooks-dlq-prod"]) assert.ok(wrangler.includes(`"${name}"`), name);
  assert.match(read(root, "package.json"), /--database repair-ops-db-prod/);
  assert.match(read(root, "workers/app.ts"), /"repair-ops-webhooks", "repair-ops-webhooks-prod"/);
  assert.match(read(root, "shopify.app.toml"), /name = "Repair Ops"/);
  assert.ok(changed.includes("scripts/ci-release.mjs"));
});

test("leaves nothing of the template's names behind in the files it edits", () => {
  const root = scratch();
  applyRenames(root, "repair-ops", "Repair Ops");
  for (const file of ["wrangler.jsonc", "package.json", "scripts/ci-release.mjs", "scripts/migrate.mjs", "workers/app.ts", "shopify.web.toml", "shopify.app.toml", "app/core/identity.ts"]) {
    const text = read(root, file);
    assert.doesNotMatch(text, /shopify-cloudflare-app|"app-db|app-support-uploads|"shopify-webhooks|TODO: Your App Name|"my-app"/, file);
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
