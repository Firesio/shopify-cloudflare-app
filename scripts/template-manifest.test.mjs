import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../template-files.json", import.meta.url), "utf8"));
const root = new URL("..", import.meta.url).pathname;
const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);

const owns = (patterns, file) => patterns.some((pattern) => (pattern.endsWith("/") ? file.startsWith(pattern) : file === pattern));

// The more specific list wins: an `app` entry inside a `template` directory (app/core/plans.ts inside app/core/) is the app's.
const owner = (file) => (owns(manifest.app, file) ? "app" : owns(manifest.template, file) ? "template" : null);

test("every tracked file is classified as the template's or the app's", () => {
  assert.deepEqual(tracked.filter((file) => owner(file) === null), []);
});

test("every entry names something that exists", () => {
  for (const pattern of [...manifest.app, ...manifest.template]) {
    assert.ok(tracked.some((file) => owns([pattern], file)), `${pattern} matches no tracked file`);
  }
});

test("the version is the top entry of the CHANGELOG and the tag is derived from it", () => {
  const top = /^## template-v(\S+)/m.exec(readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8"))?.[1];
  assert.equal(top, manifest.version);
  assert.equal(manifest.tag, `template-v${manifest.version}`);
});
