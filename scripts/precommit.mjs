#!/usr/bin/env node
// The pre-commit gate: fast, and scoped to what the commit touches.
//
//   - lint: only the staged JS/TS files (ESLint's own cache makes a re-run of unchanged files near free)
//   - typecheck: only when a TypeScript file or a file that shapes the types is staged, and incremental
//     (`tsc --incremental`: about 0.5 s when nothing changed, a few seconds to ~13 s when a widely imported file did)
// A docs-only commit therefore costs nothing. The full typecheck, lint and test suite is `npm run verify`, and CI runs it
// on every push to main and every pull request, so nothing unchecked reaches a shared branch.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const LINTABLE = /\.(m?[jt]sx?)$/;
const TYPES_SHAPERS = new Set(["tsconfig.json", "package.json", "wrangler.jsonc", "react-router.config.ts", "env.d.ts"]);

/** What a set of staged paths needs checked. Pure, so the decision is testable without git. */
export function selectChecks(staged) {
  const lint = staged.filter((file) => LINTABLE.test(file) && file !== "worker-configuration.d.ts");
  const typecheck = staged.some((file) => /\.tsx?$/.test(file) || TYPES_SHAPERS.has(file));
  return { lint, typecheck };
}

function run(label, command, args) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: repoRoot, stdio: "inherit", shell: false });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`precommit: ${label} failed (${seconds}s)`);
    process.exit(result.status ?? 1);
  }
  console.log(`precommit: ${label} ok (${seconds}s)`);
}

function stagedFiles() {
  const result = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git diff --cached failed: ${result.stderr}`);
  return result.stdout.split("\0").filter(Boolean);
}

function main() {
  const { lint, typecheck } = selectChecks(stagedFiles());
  if (lint.length > 0) {
    run(`lint ${lint.length} file(s)`, join(repoRoot, "node_modules/.bin/eslint"), [
      "--cache", "--cache-location", "./node_modules/.cache/eslint", "--no-warn-ignored", "--", ...lint,
    ]);
  }
  if (typecheck) {
    run("route types", join(repoRoot, "node_modules/.bin/react-router"), ["typegen"]);
    run("typecheck", join(repoRoot, "node_modules/.bin/tsc"), [
      "--noEmit", "--incremental", "--tsBuildInfoFile", "./node_modules/.cache/tsc.tsbuildinfo",
    ]);
  }
  if (lint.length === 0 && !typecheck) console.log("precommit: nothing to check");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
