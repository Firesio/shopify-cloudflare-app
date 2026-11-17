import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

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

/** Imports the table must refuse: [label, probe file, code]. */
const REFUSED: readonly (readonly [string, string, string])[] = [
  ["core → the composition file", "app/core/probe.ts", FIRESIO],
  ["core → db", "app/core/probe.ts", DB],
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
  ["a route → the composition file, core, db and components", "app/routes/probe.ts", `${FIRESIO}\n${CORE}\n${DB}\nimport { AppNav } from "~/components/AppNav";`],
  ["worker → the composition file and core", "workers/probe.ts", `${FIRESIO}\n${CORE}`],
  ["a test → what it tests and the test support", "app/core/probe.test.ts", `${FIRESIO}\n${CORE}\nimport { setupTestDatabase } from "~/test/database";`],
  ["a test → the root route", "app/root.probe.test.tsx", `import { ErrorBoundary } from "~/root";`],
];

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
