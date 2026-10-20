import assert from "node:assert/strict";
import test from "node:test";
import { selectChecks } from "./precommit.mjs";

test("a docs-only commit checks nothing", () => {
  assert.deepEqual(selectChecks(["README.md", "docs/webhooks.md", ".claude/rules/testing.md"]), { lint: [], typecheck: false });
});

test("a TypeScript file is linted and typechecked", () => {
  assert.deepEqual(selectChecks(["app/urls.ts", "README.md"]), { lint: ["app/urls.ts"], typecheck: true });
});

test("a script is linted but needs no typecheck", () => {
  assert.deepEqual(selectChecks(["scripts/predev.mjs"]), { lint: ["scripts/predev.mjs"], typecheck: false });
});

test("files that shape the types trigger a typecheck without being linted", () => {
  assert.deepEqual(selectChecks(["tsconfig.json"]), { lint: [], typecheck: true });
  assert.deepEqual(selectChecks(["package.json"]), { lint: [], typecheck: true });
});

test("the generated worker types are never linted", () => {
  const { lint } = selectChecks(["worker-configuration.d.ts", "app/a.tsx"]);
  assert.deepEqual(lint, ["app/a.tsx"]);
});
