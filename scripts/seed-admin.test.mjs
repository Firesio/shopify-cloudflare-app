import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";

test("local admin seed output does not advertise a fixed dev server URL", async () => {
  const source = await readFile(new URL("./seed-admin.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(source, /http:\/\/localhost:3000\/internal\/login/);
});

test("the admin scripts hash with no more PBKDF2 iterations than Cloudflare Workers accepts", async () => {
  // Workers refuses more than 100,000 (MAX_ITERATIONS in app/lib/password.ts); an account hashed above it can never sign in.
  for (const script of ["./seed-admin.mjs", "./create-admin.mjs"]) {
    const source = await readFile(new URL(script, import.meta.url), "utf8");
    assert.match(source, /^const ITERATIONS = 100_000;$/m, script);
  }
});
