import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { databaseFingerprint, isCurrent } from "./predev.mjs";

async function fixture(journal, seed = "seed") {
  const root = await mkdtemp(path.join(tmpdir(), "predev-"));
  await mkdir(path.join(root, "drizzle/meta"), { recursive: true });
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await writeFile(path.join(root, "drizzle/meta/_journal.json"), journal);
  await writeFile(path.join(root, "scripts/seed-admin.mjs"), seed);
  await writeFile(path.join(root, "scripts/admin-query.mjs"), "query");
  return root;
}

test("the same migrations and seed give the same fingerprint", async () => {
  const a = await fixture('{"entries":[1]}');
  const b = await fixture('{"entries":[1]}');
  assert.equal(databaseFingerprint(a), databaseFingerprint(b));
});

test("a new migration changes the fingerprint, so the stamp is no longer current", async () => {
  const before = databaseFingerprint(await fixture('{"entries":[1]}'));
  const after = databaseFingerprint(await fixture('{"entries":[1,2]}'));
  assert.notEqual(before, after);
  assert.equal(isCurrent(before, after), false);
});

test("a changed seed script changes the fingerprint", async () => {
  const before = databaseFingerprint(await fixture("{}", "seed v1"));
  const after = databaseFingerprint(await fixture("{}", "seed v2"));
  assert.notEqual(before, after);
});

test("a missing or blank stamp is never current", async () => {
  const fingerprint = databaseFingerprint(await fixture("{}"));
  assert.equal(isCurrent(undefined, fingerprint), false);
  assert.equal(isCurrent("", fingerprint), false);
  assert.equal(isCurrent(`${fingerprint}\n`, fingerprint), true);
});
