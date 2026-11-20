#!/usr/bin/env node
/**
 * The client bundle's budget: what the embedded admin (and Shopify POS) downloads must not grow without somebody deciding it should. Runs after
 * `react-router build` (`npm run build`), over `build/client/assets`.
 *
 * What counts is every script and stylesheet EXCEPT the staff phone app's own chunk (`PhoneLayout-*`): `app/routes/app/layout.tsx` loads it with
 * `lazy()` only on a paired staff phone, so the admin never requests it (docs/POS-AND-PHONE.md section 3), and it is measured on its own. The
 * measure is the gzip size of the scripts, the closest a file on disk gets to what travels.
 *
 * Measured 2026-11-20 (gzip of each script, summed): 173,720 bytes in 46 files on template 1.0.0 + `@firesio/app` 1.3.0; 176,801 in 50 files
 * with POS wired and campaigns on (`AppSurface`, the surface report, `PageActions`: +3.1 KB); 177,040 in 50 files with the phone app wired and
 * switched off (+0.2 KB: the `lazy()` call and its switch). The phone shell's chunk is built apart, 17,682 gzip + 21,865 of CSS, and is never
 * fetched until a paired phone opens the app. The ceiling below is the last measure plus about 10 %: it catches a surprise (a library pulled
 * into every page), not a line of code. Raise it in the commit that makes the app bigger on purpose, and say why in the message.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/** Gzip bytes of the scripts the admin loads (the phone shell's chunk is excluded) and of the stylesheets it loads. */
export const ADMIN_SCRIPT_GZIP_BUDGET = 195_000;
/** The phone shell's chunk is only ever fetched on a paired phone: a ceiling of its own, so it cannot swell unnoticed. */
export const PHONE_SCRIPT_GZIP_BUDGET = 25_000;

export function measure(assetsDir) {
  const files = readdirSync(assetsDir).filter((name) => statSync(join(assetsDir, name)).isFile());
  const gz = (name) => gzipSync(readFileSync(join(assetsDir, name))).length;
  const scripts = files.filter((name) => name.endsWith(".js"));
  const phone = scripts.filter((name) => name.startsWith("PhoneLayout-"));
  const admin = scripts.filter((name) => !name.startsWith("PhoneLayout-"));
  return {
    adminFiles: admin.length,
    adminScriptGzip: admin.reduce((sum, name) => sum + gz(name), 0),
    phoneScriptGzip: phone.reduce((sum, name) => sum + gz(name), 0),
  };
}

/** What is over its budget, in words; empty when everything fits. */
export function budgetIssues(measured, budgets = { admin: ADMIN_SCRIPT_GZIP_BUDGET, phone: PHONE_SCRIPT_GZIP_BUDGET }) {
  const issues = [];
  if (measured.adminScriptGzip > budgets.admin) {
    issues.push(`the admin's scripts are ${measured.adminScriptGzip} bytes gzip in ${measured.adminFiles} files, over the budget of ${budgets.admin} (scripts/bundle-budget.mjs): find what was added to every page, or raise the budget on purpose and say why`);
  }
  if (measured.phoneScriptGzip > budgets.phone) {
    issues.push(`the phone shell's chunk is ${measured.phoneScriptGzip} bytes gzip, over the budget of ${budgets.phone} (scripts/bundle-budget.mjs)`);
  }
  return issues;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "build", "client", "assets");
  const measured = measure(assets);
  const issues = budgetIssues(measured);
  console.log(`bundle-budget: admin ${measured.adminScriptGzip} B gzip (${measured.adminFiles} files, budget ${ADMIN_SCRIPT_GZIP_BUDGET}), phone shell ${measured.phoneScriptGzip} B gzip (budget ${PHONE_SCRIPT_GZIP_BUDGET})`);
  for (const issue of issues) console.error(`bundle-budget: ${issue}`);
  process.exit(issues.length === 0 ? 0 : 1);
}
