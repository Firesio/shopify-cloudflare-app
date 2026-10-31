import assert from "node:assert/strict";
import test from "node:test";
import { selectChecks } from "./precommit.mjs";

test("a docs-only commit checks nothing", () => {
  assert.deepEqual(selectChecks(["README.md", "docs/webhooks.md", ".claude/rules/testing.md"]), { lint: [], typecheck: false, i18n: false });
});

test("a TypeScript file is linted and typechecked", () => {
  assert.deepEqual(selectChecks(["app/urls.ts", "README.md"]), { lint: ["app/urls.ts"], typecheck: true, i18n: false });
});

test("a script is linted but needs no typecheck", () => {
  assert.deepEqual(selectChecks(["scripts/predev.mjs"]), { lint: ["scripts/predev.mjs"], typecheck: false, i18n: false });
});

test("files that shape the types trigger a typecheck without being linted", () => {
  assert.deepEqual(selectChecks(["tsconfig.json"]), { lint: [], typecheck: true, i18n: false });
  assert.deepEqual(selectChecks(["package.json"]), { lint: [], typecheck: true, i18n: false });
});

test("the generated worker types are never linted", () => {
  const { lint } = selectChecks(["worker-configuration.d.ts", "app/a.tsx"]);
  assert.deepEqual(lint, ["app/a.tsx"]);
});

test("a translation folder triggers the i18n catalogue check", () => {
  assert.equal(selectChecks(["app/i18n/locales/fr/common.json"]).i18n, true);
  assert.equal(selectChecks(["README.md"]).i18n, false);
});
