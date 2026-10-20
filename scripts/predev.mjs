#!/usr/bin/env node
// Runs before `npm run dev` / `dev:local`: local D1 migrations, the local admin seed, the local VAPID pair.
//
// Migrating and seeding each spawn wrangler (about 4 s and 3.5 s) and both are idempotent, so on a start where nothing
// changed they only cost time. A stamp stored inside .wrangler/ (so wiping local state also wipes the stamp) records
// the migration journal and seed script they last succeeded for; when both are unchanged they are skipped.
// The VAPID step is 0.2 s and depends on .dev.vars, not on the database, so it always runs.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const stampPath = join(repoRoot, ".wrangler", "predev-stamp");

/** What the database state depends on: the migration journal (the filenames are the applied key) and the seed. */
export function databaseFingerprint(root) {
  const hash = createHash("sha256");
  for (const file of ["drizzle/meta/_journal.json", "scripts/seed-admin.mjs", "scripts/admin-query.mjs"]) {
    hash.update(file);
    hash.update(readFileSync(join(root, file)));
  }
  return hash.digest("hex");
}

/** True when the stored stamp is exactly the current fingerprint. A missing stamp is never current. */
export function isCurrent(stored, fingerprint) {
  return typeof stored === "string" && stored.trim() === fingerprint;
}

function npmRun(script) {
  const result = spawnSync("npm", ["run", "-s", script], { cwd: repoRoot, stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const fingerprint = databaseFingerprint(repoRoot);
  const stored = existsSync(stampPath) ? readFileSync(stampPath, "utf8") : undefined;
  if (isCurrent(stored, fingerprint)) {
    console.log("Local database already migrated and seeded for these migrations; skipping.");
  } else {
    npmRun("db:migrate:local");
    npmRun("db:seed");
    mkdirSync(dirname(stampPath), { recursive: true });
    writeFileSync(stampPath, `${fingerprint}\n`);
  }
  npmRun("push:seed-dev");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
