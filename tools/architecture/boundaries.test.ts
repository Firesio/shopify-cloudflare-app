import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ESLint } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Proves the architecture table in eslint.boundaries.js, and the bans in eslint.config.js, are enforced. Each probe is a real
 * file written where it claims to live (the plugin classifies files on disk), linted, then removed with any folder it created.
 * If the import resolver stopped working the plugin would let every import through silently and the "refuses" cases would fail;
 * each refusal must come from the dependency rule itself.
 */
const root = join(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: root });

interface Finding {
  readonly rule: string;
  readonly message: string;
}

/** The outermost folder on the way to `path` that does not exist yet, so cleanup removes only what the probe made. */
function firstMissingFolder(path: string): string | null {
  let missing: string | null = null;
  for (let dir = dirname(path); !existsSync(dir); dir = dirname(dir)) missing = dir;
  return missing;
}

/** The plugin lets an import it cannot resolve through silently: a probe pointing at a moved file would pass for the wrong reason. */
function unresolvedImports(path: string, code: string): Finding[] {
  const specifiers = [...code.matchAll(/from "([^"]+)"/g)].map((match) => match[1] ?? "");
  return specifiers
    .filter((specifier) => specifier.startsWith("~/") || specifier.startsWith("."))
    .map((specifier) => ({ specifier, base: specifier.startsWith("~/") ? join(root, "app", specifier.slice(2)) : join(dirname(path), specifier) }))
    .filter(({ base }) => ![".ts", ".tsx", "/index.ts"].some((suffix) => existsSync(`${base}${suffix}`)))
    .map(({ specifier }) => ({ rule: "probe/unresolved", message: specifier }));
}

/** Writes the probe where it claims to live, lints it with the whole config, removes it; the findings of the rules whose id starts with `prefix`. */
async function lintProbe(relativePath: string, code: string, prefix: string): Promise<{ path: string; findings: Finding[] }> {
  const path = join(root, relativePath.replace(/probe\.tsx?$/, (ext) => `probe-${crypto.randomUUID()}${ext.slice("probe".length)}`));
  const created = firstMissingFolder(path);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, `${code}\nexport const probe = 1;\n`);
    const [result] = await eslint.lintFiles([path]);
    const findings = (result?.messages ?? []).filter((m) => m.ruleId?.startsWith(prefix) === true).map((m) => ({ rule: m.ruleId ?? "", message: m.message }));
    return { path, findings };
  } finally {
    await rm(created ?? path, { recursive: true, force: true });
  }
}

async function boundaryFindings(relativePath: string, code: string): Promise<Finding[]> {
  const { path, findings } = await lintProbe(relativePath, code, "boundaries/");
  return [...unresolvedImports(path, code), ...findings];
}

const CORE = `import { PLANS } from "~/core/plans";`;
const DB = `import * as schema from "~/db/schema";`;
const FIRESIO = `import { firesio } from "~/firesio.server";`;
const ROUTE = `import { loader } from "~/routes/healthz";`;
const COMPONENT = `import { AppNav } from "~/components/AppNav";`;

/**
 * Files the probes import from in the layers the template has no file in yet (an app's adapters, wiring and messages, in
 * feature sub-folders as a grown app has them): written before the probes, removed after with any folder they created.
 */
const TARGETS: Readonly<Record<"adapter" | "wiring" | "notifications", string>> = {
  adapter: "app/adapters/probe-orders/orders-repo.ts",
  wiring: "app/wiring/probe-orders.ts",
  notifications: "app/notifications/probe-messages.ts",
};
const ADAPTER = `import { target } from "~/adapters/probe-orders/orders-repo";`;
const WIRING = `import { target } from "~/wiring/probe-orders";`;
const NOTIFICATIONS = `import { target } from "~/notifications/probe-messages";`;
const madeFolders: string[] = [];

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
  ["i18n → the composition file", "app/i18n/probe.ts", FIRESIO],
  ["components → the composition file", "app/components/probe.ts", FIRESIO],
  ["components → db", "app/components/probe.ts", DB],
  ["worker → db", "workers/probe.ts", DB],
  ["route → test support", "app/routes/probe.ts", `import { setupTestDatabase } from "~/test/database";`],
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
  ["an adapter → core, db and another adapter", "app/adapters/billing/probe.ts", `${CORE}\n${DB}\n${ADAPTER}`],
  ["wiring → core, db and adapters", "app/wiring/probe.ts", `${CORE}\n${DB}\n${ADAPTER}`],
  ["notifications → core and components", "app/notifications/probe.tsx", `${CORE}\n${COMPONENT}`],
  ["components, in a feature folder → components and core", "app/components/orders/probe.tsx", `${CORE}\n${COMPONENT}`],
  ["a test → an adapter and wiring", "app/adapters/orders/probe.test.ts", `${ADAPTER}\n${WIRING}\n${DB}`],
  ["worker → the composition file and core", "workers/probe.ts", `${FIRESIO}\n${CORE}`],
  ["a test → what it tests and the test support", "app/core/probe.test.ts", `${FIRESIO}\n${CORE}\nimport { setupTestDatabase } from "~/test/database";`],
  ["a test → the root route", "app/root.probe.test.tsx", `import { ErrorBoundary } from "~/root";`],
];

beforeAll(async () => {
  for (const file of Object.values(TARGETS)) {
    const path = join(root, file);
    const made = firstMissingFolder(path);
    if (made !== null) madeFolders.push(made);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "export const target = 1;\n");
  }
});

afterAll(async () => {
  for (const file of Object.values(TARGETS)) await rm(join(root, file), { force: true });
  for (const folder of madeFolders) await rm(folder, { recursive: true, force: true });
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
  const ban = async (path: string, code: string, rule: string) => (await lintProbe(path, code, rule)).findings;

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

  it("refuses a function over 40 lines", async () => {
    const body = Array.from({ length: 45 }, (_, i) => `  const v${i} = ${i};`).join("\n");
    expect(await ban("app/core/probe.ts", `export function long() {\n${body}\n  return 1;\n}`, "max-lines-per-function")).not.toEqual([]);
  });
});

describe("the import bans (eslint.config.js)", () => {
  const ban = async (path: string, code: string) => (await lintProbe(path, code, "no-restricted-imports")).findings;

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
