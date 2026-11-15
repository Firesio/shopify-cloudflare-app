import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// wrangler prints "Missing required secrets: ..." for every project start, and they are fake in tests on purpose.
process.env.WRANGLER_LOG ??= "error";

// The Drizzle-generated migrations, handed to workerd so tests build the schema in a real D1 (`setupTestDatabase`).
const migrations = await readD1Migrations(path.join(import.meta.dirname, "drizzle"));

function collectTests(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTests(full);
    return entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx") ? [full] : [];
  });
}

// WHICH PROJECT A TEST RUNS IN IS ITS FILE NAME, never what it imports:
//   *.e2e.test.ts(x)     boots the REAL Worker entry (`workers/app.ts`) in its own project and calls it through `exports`.
//   *.workerd.test.ts(x) runs in workerd and imports the code it exercises directly (bindings, D1, the composition file). A
//                        test under `app/routes/` (it imports `firesio.server.ts`, which reads `env`) or `workers/` is one too.
//   *.test.ts(x)         everything else: pure code, in Node.
// A Node test that imports `cloudflare:*` would fail at import with an obscure message: the guard below says which file to rename.
const E2E = /\.e2e\.test\.tsx?$/;
const WORKERD = /\.workerd\.test\.tsx?$/;
const inWorkerdFolder = (file: string) => file.startsWith("app/routes/") || file.startsWith("workers/");

const allTests = collectTests("app").concat(collectTests("workers"), collectTests("tools/architecture"));
const e2eFiles = allTests.filter((file) => E2E.test(file));
const workersFiles = allTests.filter((file) => !E2E.test(file) && (WORKERD.test(file) || inWorkerdFolder(file)));
const unitFiles = allTests.filter((file) => !E2E.test(file) && !WORKERD.test(file) && !inWorkerdFolder(file));
for (const file of unitFiles) {
  if (readFileSync(file, "utf8").includes("cloudflare:")) throw new Error(`${file} imports cloudflare:* but runs in Node: rename it to ${file.replace(/\.test\.(tsx?)$/, ".workerd.test.$1")}`);
}

/** The wrangler name of this Worker: a test-only service binding that names it reaches the Worker under test itself. */
const WORKER_NAME = /^\s*"name":\s*"([^"]+)"/m.exec(readFileSync(path.join(import.meta.dirname, "wrangler.jsonc"), "utf8"))?.[1];
if (WORKER_NAME === undefined) throw new Error("wrangler.jsonc has no top-level name");

// Secrets and vars the tests inject (fake on purpose); shared by both workerd projects.
const testBindings = {
  TEST_MIGRATIONS: JSON.stringify(migrations),
  SHOPIFY_API_KEY: "test-api-key",
  SHOPIFY_API_SECRET: "test-api-secret",
  // The preset refuses an empty SCOPES; the template's own value is empty (it declares no scope), so the tests name one.
  SCOPES: "read_products",
  SHOP_CUSTOM_DOMAIN: "example.myshopify.com",
  SHOPIFY_APP_URL: "https://example.test",
  ATTACHMENT_TOKEN_SECRET: "test-attachment-secret",
  EVENT_HASH_SECRET: "test-event-hash-secret-of-at-least-thirty-two-characters",
  EVENT_HASH_KEY_ID: "test-key",
  PARTNER_API_TOKEN: "test-partner-token",
};
const outboundService = () => new Response("Outbound network is blocked in tests. Fake this call at the HTTP boundary.", { status: 403 });

export default defineConfig({
  test: {
    projects: [
      {
        // `cloudflare:workers` exists in workerd only: the package's own stand-in lets a Node test import `@firesio/app` (for its
        // exported constants, e.g. the cron expressions) without booting a Worker.
        resolve: { alias: { "~": path.resolve(import.meta.dirname, "app"), "cloudflare:workers": "@firesio/app/preset/testing/cloudflare-workers" } },
        test: {
          name: "unit",
          include: unitFiles,
          environment: "node",
          // Pure code with no shared binding state: modules are evaluated once per worker, not once per file.
          isolate: false,
          fsModuleCache: true,
        },
      },
      {
        resolve: { tsconfigPaths: true },
        plugins: [
          cloudflareTest({
            // A stub entry: tests import the code they exercise directly (see app/test/worker-entry.ts).
            main: "./app/test/worker-entry.ts",
            wrangler: { configPath: "./wrangler.jsonc" },
            remoteBindings: false,
            miniflare: {
              outboundService,
              bindings: testBindings,
            },
          }),
        ],
        test: {
          name: "workers",
          // One workerd runtime shared by every file in a worker. KV, R2 and in-memory state are NOT reset between files, so
          // a test uses unique keys and resets D1 with setupTestDatabase().
          isolate: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
          include: workersFiles,
        },
      },
      {
        resolve: {
          tsconfigPaths: true,
          // The React Router Vite plugin generates this virtual module; the tests give the real Worker a build of the routes they call.
          alias: { "virtual:react-router/server-build": path.resolve(import.meta.dirname, "app/test/server-build.ts") },
        },
        plugins: [
          cloudflareTest({
            // The REAL Worker entry: `exports.default.fetch`, `.queue` and `.scheduled` are the app's own handlers, and `exports.AdminApi` its entrypoint.
            main: "./workers/app.ts",
            wrangler: { configPath: "./wrangler.jsonc" },
            remoteBindings: false,
            miniflare: {
              outboundService,
              bindings: testBindings,
              // The portal's way in: a service binding to this Worker's named `AdminApi` entrypoint (the portal's `entrypoint: "AdminApi"`).
              serviceBindings: { PORTAL_ADMIN_API: { name: WORKER_NAME, entrypoint: "AdminApi" }, WORKER_SELF: { name: WORKER_NAME } },
            },
          }),
        ],
        test: {
          name: "e2e",
          isolate: false,
          testTimeout: 60_000,
          hookTimeout: 60_000,
          include: e2eFiles,
        },
      },
    ],
  },
});
