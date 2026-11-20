import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { budgetIssues, measure } from "./bundle-budget.mjs";

/** An asset folder: random bytes do not compress, so a file's gzip size is about its size. */
function assets(files) {
  const dir = mkdtempSync(join(tmpdir(), "budget-"));
  for (const [name, size] of Object.entries(files)) writeFileSync(join(dir, name), randomBytes(size));
  return dir;
}

test("counts the phone shell's chunk apart from what the admin loads, and ignores stylesheets", () => {
  const measured = measure(assets({ "layout-a.js": 2000, "home-b.js": 1000, "PhoneLayout-c.js": 4000, "PhoneLayout-d.css": 9000, "app-e.css": 3000 }));
  assert.equal(measured.adminFiles, 2);
  assert.ok(measured.adminScriptGzip >= 3000 && measured.adminScriptGzip < 3200, String(measured.adminScriptGzip));
  assert.ok(measured.phoneScriptGzip >= 4000 && measured.phoneScriptGzip < 4200, String(measured.phoneScriptGzip));
});

test("says which budget is over, and nothing when both fit", () => {
  assert.deepEqual(budgetIssues({ adminFiles: 3, adminScriptGzip: 100, phoneScriptGzip: 50 }, { admin: 100, phone: 50 }), []);
  const over = budgetIssues({ adminFiles: 3, adminScriptGzip: 101, phoneScriptGzip: 51 }, { admin: 100, phone: 50 });
  assert.equal(over.length, 2);
  assert.match(over[0], /admin's scripts are 101 bytes gzip in 3 files, over the budget of 100/);
  assert.match(over[1], /phone shell's chunk is 51 bytes gzip, over the budget of 50/);
});
