import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger, resolveConfig, type Logger, type ResolvedConfig } from "vite";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `vite.config.ts` as Vite resolves it for `vite dev` (`resolveConfig(..., "serve")` runs every plugin's config hooks, React Router's
 * child compiler and route typegen included; it starts no workerd and opens no port). `firesioVite()` must leave ONE copy of
 * `@firesio/app` in the dev server: excluded from dependency pre-bundling in the Worker's environment and the browser's, and what it
 * imports pre-bundled through it instead. With a pre-bundled copy next to the source one, every package page answered 500 "No value
 * found for context" (found live in Team Up).
 */
const root = join(import.meta.dirname, "../..");
const resolved: ResolvedConfig[] = [];

async function resolveForDev(logger: Logger = createLogger("silent")): Promise<ResolvedConfig> {
  const config = await resolveConfig({ root, configFile: join(root, "vite.config.ts"), customLogger: logger, logLevel: "warn" }, "serve");
  resolved.push(config);
  return config;
}

/**
 * What Vite does when it closes a dev server: React Router's `buildEnd` closes the child compiler, its config watcher and its route
 * typegen (which rewrites `.react-router/types`; a test process that exits while it writes leaves the route types half written).
 */
afterAll(async () => {
  for (const config of resolved) {
    const hook = config.plugins.find((plugin) => plugin.name === "react-router")?.buildEnd;
    const handler = typeof hook === "function" ? hook : hook?.handler;
    if (handler !== undefined) await Reflect.apply(handler, undefined, []);
  }
});

/** A logger that keeps the warnings (the plugin warns at start when an `optimizeDeps.include` pre-bundles the package again). */
function recordingLogger(): { readonly logger: Logger; readonly warnings: string[] } {
  const warnings: string[] = [];
  const base = createLogger("silent");
  return { logger: { ...base, warn: (message) => void warnings.push(message), warnOnce: (message) => void warnings.push(message) }, warnings };
}

const sources = (folder: string): string[] =>
  readdirSync(join(root, folder), { recursive: true, encoding: "utf8" }).filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file)).map((file) => join(folder, file));
const NAMED_IMPORT = /^import\s+(?!type\s)[^;]*?\sfrom\s+"([^"]+)"/gm;
const SIDE_EFFECT_IMPORT = /^import\s+"([^"]+)"/gm;
const packagesIn = (file: string, pattern: RegExp): string[] =>
  [...readFileSync(join(root, file), "utf8").matchAll(pattern)].map((match) => match[1] ?? "").filter((specifier) => !specifier.startsWith(".") && !specifier.startsWith("~/"));

/**
 * The packages the browser surely loads from the app's own code: every import of the client entry and the components, and the
 * side-effect imports of the root and the route modules (a named import of a route module may serve only its loader, action or
 * headers, which React Router strips from the browser's copy of the module).
 */
function browserPackages(): string[] {
  const always = ["app/entry.client.tsx", ...sources("app/components")].flatMap((file) => [...packagesIn(file, NAMED_IMPORT), ...packagesIn(file, SIDE_EFFECT_IMPORT)]);
  const sideEffects = ["app/root.tsx", ...sources("app/routes")].flatMap((file) => packagesIn(file, SIDE_EFFECT_IMPORT));
  return [...new Set([...always, ...sideEffects])].sort();
}

// Each case resolves the whole Vite config (and starts a dev server): on a busy machine, with hundreds of test files running beside it, the default 5 s is not enough. A time budget only; the assertions are unchanged.
describe("vite.config.ts in the dev server", { timeout: 60_000 }, () => {
  it("excludes @firesio/app from pre-bundling in the Worker's and the browser's environments, and pre-bundles its imports through it", async () => {
    const { logger, warnings } = recordingLogger();
    const config = await resolveForDev(logger);
    for (const name of ["ssr", "client"]) {
      const deps = config.environments[name]?.optimizeDeps;
      expect(deps?.exclude, name).toContain("@firesio/app");
      const include = deps?.include ?? [];
      // Through the package (`@firesio/app > react`), never the package itself or one of its subpaths.
      expect(include.some((entry) => entry.startsWith("@firesio/app > ")), name).toBe(true);
      expect(include.filter((entry) => !entry.includes(">") && entry.trim().startsWith("@firesio/app")), name).toEqual([]);
    }
    // The CommonJS modules the Worker reaches through the package (the AI SDK, Cloudflare's provider for it): workerd cannot load them raw.
    expect(config.environments["ssr"]?.optimizeDeps.include).toEqual(expect.arrayContaining(["@firesio/app > ai", "@firesio/app > agents/models/ai-sdk"]));
    expect(warnings.filter((message) => message.includes("[firesio:vite]"))).toEqual([]);
  });

  it("scans the Worker's entry and route modules for dependencies, and nothing for the browser (React Router's future.unstable_optimizeDeps is off)", async () => {
    const { environments } = await resolveForDev();
    expect(environments["client"]?.optimizeDeps.entries).toEqual([]);
    expect(environments["ssr"]?.optimizeDeps.entries).toEqual(expect.arrayContaining([join(root, "workers/app.ts"), join(root, "app/root.tsx"), join(root, "app/routes/healthz.ts")]));
  });

  it("pre-bundles for the browser every package the app's browser code imports, since nothing scans it", async () => {
    const include = (await resolveForDev()).environments["client"]?.optimizeDeps.include ?? [];
    const packages = browserPackages();
    expect(packages).toContain("@shopify/app-bridge-types");
    // Listed, or pre-bundled through a package that imports the same copy (`@firesio/app > zod`), or `@firesio/app` itself (served from source).
    const missing = packages.filter((name) => !include.includes(name) && !include.some((entry) => entry.endsWith(` > ${name}`)) && name !== "@firesio/app" && !name.startsWith("@firesio/app/"));
    expect(missing, "add each to environments.client.optimizeDeps.include in vite.config.ts").toEqual([]);
  });

  it("keeps the Cloudflare plugin when Vite restarts the dev server (it evaluates this file again in the same process)", async () => {
    // `server.restart()` resolves the config anew, as here; the child compiler React Router builds from its `configResolved` hook
    // must leave the plugin out, a restart must not (scripts/vite-child-compiler.mjs).
    for (const start of ["start", "first restart", "second restart"]) {
      expect((await resolveForDev()).plugins.map((plugin) => plugin.name), start).toContain("vite-plugin-cloudflare");
    }
  });
});
