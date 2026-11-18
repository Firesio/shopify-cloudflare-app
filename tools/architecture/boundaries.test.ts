import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProbeWorld, type Finding, type ProbeWorld } from "./probe-world";

/**
 * Proves the architecture table in eslint.boundaries.js, and the bans in eslint.config.js, are enforced. Each probe is a file linted
 * with the repo's whole config where it claims to live, in a throwaway copy of the layout outside the repo (`./probe-world.ts`: no
 * file is ever written into `app/`). If the import resolver stopped working the plugin would let every import through silently and
 * the "refuses" cases would fail; each refusal must come from the dependency rule itself.
 */
let world: ProbeWorld;

async function boundaryFindings(relativePath: string, code: string): Promise<readonly Finding[]> {
  return [...world.unresolved(relativePath, code), ...(await world.lint(relativePath, code, "boundaries/"))];
}

const CORE = `import { PLANS } from "~/core/plans";`;
const DB = `import * as schema from "~/db/schema";`;
const FIRESIO = `import { firesio } from "~/firesio.server";`;
const ROUTE = `import { loader } from "~/routes/healthz";`;
const COMPONENT = `import { AppNav } from "~/components/AppNav";`;

/** The modules the probes import, at the paths of the app's layout (empty modules in the probe world): the template's files, and an
 * adapter, a wiring module and messages in feature sub-folders, the layers a grown app fills. */
const WORLD = [
  "app/core/plans.ts",
  "app/db/schema.ts",
  "app/firesio.server.ts",
  "app/routes/healthz.ts",
  "app/components/AppNav.tsx",
  "app/test/database.ts",
  "app/root.tsx",
  "app/adapters/orders/orders-repo.ts",
  "app/wiring/orders.ts",
  "app/notifications/messages.ts",
  "app/core/orders/order.ts",
  "app/core/orders/vocabulary.ts",
  "app/adapters/orders/vocabulary.ts",
  "app/ai/orders.ts",
  "app/i18n/orders.ts",
  "workers/app.ts",
];
const ADAPTER = `import { target } from "~/adapters/orders/orders-repo";`;
const WIRING = `import { target } from "~/wiring/orders";`;
const NOTIFICATIONS = `import { target } from "~/notifications/messages";`;
const VOCABULARY = `import { ORDER_STATUSES } from "~/core/orders/vocabulary";`;
const TEST_SUPPORT = `import { setupTestDatabase } from "~/test/database";`;

/** Test support stays test-only: every file that is not a test and not test support, in each layer, is refused an import of it. */
const NOT_TESTS = [
  "app/core/orders/probe.ts",
  "app/db/probe.ts",
  "app/adapters/orders/probe.ts",
  "app/wiring/probe.ts",
  "app/notifications/probe.ts",
  "app/components/orders/probe.tsx",
  "app/i18n/probe.ts",
  "app/ai/probe.ts",
  "app/routes/app/orders/probe.ts",
  "workers/probe.ts",
  "tools/architecture/probe.ts",
  "app/firesio.server.ts",
  "app/root.tsx",
];

/**
 * The Worker env's module, written into the probes' code only. Spelled in two parts because `vitest.config.ts` refuses a Node test
 * whose text names that scheme (an import of it would fail in Node with an obscure message); this file imports nothing of it.
 */
const WORKER_MODULE = ["cloudflare", "workers"].join(":");
const TEST_MODULE = ["cloudflare", "test"].join(":");
const READS_ENV = `import { env } from "${WORKER_MODULE}";\nexport const used = env;`;

/** Imports the table must refuse: [label, probe file, code]. */
const REFUSED: readonly (readonly [string, string, string])[] = [
  ["core → the composition file", "app/core/probe.ts", FIRESIO],
  ["core → db", "app/core/probe.ts", DB],
  ["core, in a feature folder → the composition file", "app/core/orders/probe.ts", FIRESIO],
  ["core, in a feature folder → an adapter", "app/core/orders/probe.ts", ADAPTER],
  ["db → an adapter", "app/db/probe.ts", ADAPTER],
  ["an adapter → the composition file", "app/adapters/orders/probe.ts", FIRESIO],
  ["an adapter → wiring", "app/adapters/orders/probe.ts", WIRING],
  ["an adapter → a route", "app/adapters/orders/probe.ts", ROUTE],
  ["wiring → the composition file", "app/wiring/probe.ts", FIRESIO],
  ["wiring → a route", "app/wiring/probe.ts", ROUTE],
  ["a route → db (a query is an adapter's)", "app/routes/app/orders/probe.ts", DB],
  ["a route → an adapter", "app/routes/app/orders/probe.ts", ADAPTER],
  ["a route → wiring", "app/routes/probe.ts", WIRING],
  ["components → an adapter", "app/components/orders/probe.tsx", ADAPTER],
  ["notifications → the composition file", "app/notifications/probe.ts", FIRESIO],
  ["notifications → db", "app/notifications/probe.ts", DB],
  ["worker → an adapter", "workers/probe.ts", ADAPTER],
  ["core → the messages", "app/core/probe.ts", NOTIFICATIONS],
  ["a route → the messages (it sends through the services)", "app/routes/probe.ts", NOTIFICATIONS],
  ["db → core", "app/db/probe.ts", CORE],
  ["db → a core file of a feature that is not its vocabulary", "app/db/orders.probe.ts", `import { target } from "~/core/orders/order";`],
  ["db → a file named vocabulary outside core", "app/db/orders.probe.ts", `import { target } from "~/adapters/orders/vocabulary";`],
  ["i18n → the composition file", "app/i18n/probe.ts", FIRESIO],
  ["components → the composition file", "app/components/probe.ts", FIRESIO],
  ["components → db", "app/components/probe.ts", DB],
  ["worker → db", "workers/probe.ts", DB],
  ...NOT_TESTS.map((path) => [`${path.replace(/\/probe\.tsx?$/, "")} → test support (it is test-only)`, path, TEST_SUPPORT] as const),
  ["an AI feature → the composition file", "app/ai/probe.ts", FIRESIO],
  ["an AI feature → db", "app/ai/probe.ts", DB],
];

/** Imports the table must allow: [label, probe file, code]. */
const ALLOWED: readonly (readonly [string, string, string])[] = [
  ["core → core", "app/core/probe.ts", CORE],
  ["an AI feature → core", "app/ai/probe.ts", CORE],
  ["i18n → core", "app/i18n/probe.ts", CORE],
  ["a route → the composition file, core and components", "app/routes/probe.ts", `${FIRESIO}\n${CORE}\n${COMPONENT}`],
  ["a route in a feature folder → the composition file, core and components", "app/routes/app/orders/probe.ts", `${FIRESIO}\n${CORE}\n${COMPONENT}`],
  ["core, in a feature folder → core", "app/core/orders/probe.ts", CORE],
  ["db → a feature's vocabulary (the value lists its CHECK constraints are built from)", "app/db/orders.probe.ts", VOCABULARY],
  ["core → a feature's vocabulary (the same lists, for its types and rules)", "app/core/orders/probe.ts", VOCABULARY],
  ["an adapter → core, db and another adapter", "app/adapters/billing/probe.ts", `${CORE}\n${DB}\n${ADAPTER}`],
  ["wiring → core, db and adapters", "app/wiring/probe.ts", `${CORE}\n${DB}\n${ADAPTER}`],
  ["notifications → core and components", "app/notifications/probe.tsx", `${CORE}\n${COMPONENT}`],
  ["components, in a feature folder → components and core", "app/components/orders/probe.tsx", `${CORE}\n${COMPONENT}`],
  ["a test → an adapter and wiring", "app/adapters/orders/probe.test.ts", `${ADAPTER}\n${WIRING}\n${DB}`],
  ["worker → the composition file and core", "workers/probe.ts", `${FIRESIO}\n${CORE}`],
  ["a test → what it tests and the test support", "app/core/probe.test.ts", `${FIRESIO}\n${CORE}\nimport { setupTestDatabase } from "~/test/database";`],
  ["a test → the root route", "app/root.probe.test.tsx", `import { ErrorBoundary } from "~/root";`],
  [
    "test support, in a feature folder → what a test may reach (a world: tables, adapters, wiring, routes, messages, the Worker)",
    "app/test/orders/probe.ts",
    [TEST_SUPPORT, DB, ADAPTER, WIRING, ROUTE, NOTIFICATIONS, COMPONENT, FIRESIO, CORE, VOCABULARY, `import { target as ai } from "~/ai/orders";`, `import { target as words } from "~/i18n/orders";`, `import { target as worker } from "../../../workers/app";`, `import { ErrorBoundary } from "~/root";`].join("\n"),
  ],
];

beforeAll(async () => {
  world = await createProbeWorld(WORLD);
});

afterAll(async () => {
  await world.remove();
});

describe("architecture boundaries", () => {
  it.each(REFUSED)("refuses %s", async (_label, filePath, code) => {
    const rules = (await boundaryFindings(filePath, code)).map((f) => f.rule);
    expect(rules).toContain("boundaries/dependencies");
    expect(rules).not.toContain("boundaries/no-unknown-files");
    expect(rules).not.toContain("probe/unresolved");
  });

  it.each(ALLOWED)("allows %s", async (_label, filePath, code) => {
    expect(await boundaryFindings(filePath, code)).toEqual([]);
  });

  it("refuses a file in a folder the table does not know", async () => {
    const rules = (await boundaryFindings("app/stray/probe.ts", "")).map((f) => f.rule);
    expect(rules).toContain("boundaries/no-unknown-files");
  });
});

describe("the bans", () => {
  const ban = (path: string, code: string, rule: string) => world.lint(path, code, rule);

  it.each([
    ["Date.now", "const at = Date.now();"],
    ["new Date()", "const at = new Date();"],
    ["crypto.randomUUID", "const id = crypto.randomUUID();"],
    ["globalThis.crypto.randomUUID", "const id = globalThis.crypto.randomUUID();"],
    ["self.crypto.randomUUID", "const id = self.crypto.randomUUID();"],
    ["Math.random", "const n = Math.random();"],
  ])("refuses %s in the app's own code (the preset's runtime is the one place that reads them)", async (_label, code) => {
    const used = `export const used = () => { ${code} return 1; };`;
    for (const path of ["app/core/probe.ts", "app/routes/probe.ts", "workers/probe.ts"]) {
      expect((await ban(path, used, "no-restricted-")).length, path).toBeGreaterThan(0);
    }
  });

  it("allows them in a test, and a Date made from a value anywhere", async () => {
    expect(await ban("app/core/probe.test.ts", "export const now = () => Date.now();", "no-restricted-")).toEqual([]);
    expect(await ban("app/core/probe.ts", "export const at = (ms: number) => new Date(ms);", "no-restricted-")).toEqual([]);
  });

  it("refuses a type assertion, any and a ts-ignore", async () => {
    expect(await ban("app/core/probe.ts", `export const n = JSON.parse("1") as number;`, "@typescript-eslint/consistent-type-assertions")).not.toEqual([]);
    expect(await ban("app/core/probe.ts", `export const n = (value: any) => value;`, "@typescript-eslint/no-explicit-any")).not.toEqual([]);
    expect(await ban("app/core/probe.ts", `// @ts-ignore\nexport const n: number = "x";`, "@typescript-eslint/ban-ts-comment")).not.toEqual([]);
  });

  it("refuses React and fetch in core", async () => {
    expect(await ban("app/core/probe.ts", `import * as react from "react";\nexport const used = react;`, "no-restricted-imports")).not.toEqual([]);
    expect(await ban("app/core/probe.ts", `export const load = () => fetch("https://example.test");`, "no-restricted-globals")).not.toEqual([]);
  });

  it("refuses a vocabulary any import or logic, and allows it value lists and their types", async () => {
    const at = "app/core/billing/vocabulary.ts";
    for (const code of [CORE, `import { z } from "zod";\nexport const used = z;`, `export * from "./statuses";`, `export { ORDER_STATUSES } from "~/core/orders/vocabulary";`, "export const isOpen = (status: string) => status === \"open\";", "export function isOpen() { return true; }"]) {
      expect(await ban(at, code, "no-restricted-syntax"), code).not.toEqual([]);
    }
    expect(await ban(at, `export const INVOICE_STATES = ["draft", "sent"] as const;\nexport type InvoiceState = (typeof INVOICE_STATES)[number];`, "no-restricted-syntax")).toEqual([]);
  });

  it("refuses a function over 40 lines", async () => {
    const body = Array.from({ length: 45 }, (_, i) => `  const v${i} = ${i};`).join("\n");
    expect(await ban("app/core/probe.ts", `export function long() {\n${body}\n  return 1;\n}`, "max-lines-per-function")).not.toEqual([]);
  });
});

describe("the import bans (eslint.config.js)", () => {
  const ban = (path: string, code: string) => world.lint(path, code, "no-restricted-imports");

  it("refuses createFiresio outside the composition file (the one call), but not in a test", async () => {
    const build = `import { createFiresio } from "@firesio/app";\nexport const build = createFiresio;`;
    for (const path of ["app/routes/probe.ts", "app/wiring/probe.ts", "workers/probe.ts", "app/core/probe.ts"]) {
      expect((await ban(path, build)).length, path).toBeGreaterThan(0);
    }
    expect(await ban("app/routes/probe.test.ts", build)).toEqual([]);
  });

  it.each([
    ["a query builder", `import { eq } from "drizzle-orm";\nexport const used = eq;`],
    ["the Worker env", READS_ENV],
    ["a value of the preset", `import { DAILY_CRON } from "@firesio/app";\nexport const used = DAILY_CRON;`],
    ["a package page", `import { Notice } from "@firesio/app/ui/shell";\nexport const used = Notice;`],
    ["a D1 adapter of the package", `import * as d1 from "@firesio/app/support/d1";\nexport const used = d1;`],
  ])("refuses %s in core", async (_label, code) => {
    expect(await ban("app/core/orders/probe.ts", code)).not.toEqual([]);
  });

  it("allows core a type of the preset and the package's pure libraries", async () => {
    const code = `import type { ShopRecord } from "@firesio/app";\nimport { definePlans } from "@firesio/app/plans";\nexport type Used = ShopRecord;\nexport const used = definePlans;`;
    expect(await ban("app/core/orders/probe.ts", code)).toEqual([]);
  });

  it("refuses React and the Worker env in adapters and wiring, and allows them a query builder; their tests read the test bindings", async () => {
    for (const path of ["app/adapters/orders/probe.ts", "app/wiring/probe.ts"]) {
      expect(await ban(path, `import * as react from "react";\nexport const used = react;`), path).not.toEqual([]);
      expect(await ban(path, READS_ENV), path).not.toEqual([]);
      expect(await ban(path, `import { eq } from "drizzle-orm";\nexport const used = eq;`), path).toEqual([]);
    }
    expect(await ban("app/adapters/orders/probe.test.ts", `import { env } from "${TEST_MODULE}";\nexport const used = env;`)).toEqual([]);
  });

  it("refuses a query builder and the Worker env in components, words, messages and AI features", async () => {
    for (const path of ["app/components/orders/probe.tsx", "app/i18n/probe.ts", "app/notifications/probe.ts", "app/ai/probe.ts"]) {
      expect(await ban(path, `import { eq } from "drizzle-orm";\nexport const used = eq;`), path).not.toEqual([]);
      expect(await ban(path, READS_ENV), path).not.toEqual([]);
    }
  });
});
