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

// A test that touches a binding runs in workerd; a pure one runs in Node. `workers/` holds the Worker entry's own tests.
const [workersFiles, unitFiles] = collectTests("app")
  .concat(collectTests("workers"), collectTests("tools/architecture"))
  .reduce<[string[], string[]]>(
    ([inWorkers, inNode], file) => {
      const source = readFileSync(file, "utf8");
      // Routes and wiring import the composition root, which reads `env` from cloudflare:workers.
      const needsWorkerd = file.startsWith("app/routes/") || file.startsWith("app/wiring/") || source.includes("cloudflare:test") || source.includes("cloudflare:workers") || source.includes("applyD1Migrations");
      return needsWorkerd ? [[...inWorkers, file], inNode] : [inWorkers, [...inNode, file]];
    },
    [[], []],
  );

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: { "~": path.resolve(import.meta.dirname, "app") } },
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
              outboundService: () => new Response("Outbound network is blocked in tests. Fake this call at the HTTP boundary.", { status: 403 }),
              bindings: {
                TEST_MIGRATIONS: JSON.stringify(migrations),
                SHOPIFY_API_KEY: "test-api-key",
                SHOPIFY_API_SECRET: "test-api-secret",
                SHOP_CUSTOM_DOMAIN: "example.myshopify.com",
                SHOPIFY_APP_URL: "https://example.test",
                ATTACHMENT_TOKEN_SECRET: "test-attachment-secret",
                EVENT_HASH_SECRET: "test-event-hash-secret",
                EVENT_HASH_KEY_ID: "test-key",
                PARTNER_API_TOKEN: "test-partner-token",
              },
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
    ],
  },
});
