import assert from "node:assert/strict";
import test from "node:test";
import { appDevEnv } from "./dev-env.mjs";

test("app dev quiets wrangler's warnings by default", () => {
  assert.deepEqual(appDevEnv(["app", "dev", "--config", "dev"], {}), { WRANGLER_LOG: "error" });
});

test("a WRANGLER_LOG the caller already set wins", () => {
  assert.deepEqual(appDevEnv(["app", "dev"], { WRANGLER_LOG: "warn" }), { WRANGLER_LOG: "warn" });
});

test("other CLI commands are untouched", () => {
  assert.deepEqual(appDevEnv(["app", "deploy"], {}), {});
  assert.deepEqual(appDevEnv(["auth", "logout"], {}), {});
  assert.deepEqual(appDevEnv(["app", "dev", "--help"], {}), {});
});
