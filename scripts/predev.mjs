#!/usr/bin/env node
// Runs before `npm run dev`: the local D1 migrations.
//
// Migrating spawns wrangler (about 4 s) and is idempotent, so on a start where nothing changed it only costs time. A stamp
// stored inside .wrangler/ (so wiping local state also wipes the stamp) records the migration journal it last succeeded for;
// when it is unchanged the step is skipped.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const stampPath = join(repoRoot, ".wrangler", "predev-stamp");

/** What the database state depends on: the migration journal (the filenames are the applied key). */
export function databaseFingerprint(root) {
  const hash = createHash("sha256");
  for (const file of ["drizzle/meta/_journal.json"]) {
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
    console.log("Local database already migrated for these migrations; skipping.");
  } else {
    npmRun("db:migrate:local");
    mkdirSync(dirname(stampPath), { recursive: true });
    writeFileSync(stampPath, `${fingerprint}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
