import { join } from "node:path";
import { createLogger, resolveConfig, type Logger } from "vite";
import { describe, expect, it } from "vitest";

/**
 * `vite.config.ts` as Vite resolves it for `vite dev` (`resolveConfig(..., "serve")` runs every plugin's config hooks; it starts no
 * server, no workerd and opens no port). `firesioVite()` must leave ONE copy of `@firesio/app` in the dev server: excluded from
 * dependency pre-bundling in the Worker's environment and the browser's, and what it imports pre-bundled through it instead. With a
 * pre-bundled copy next to the source one, every package page answered 500 "No value found for context" (found live in Team Up).
 */
const root = join(import.meta.dirname, "../..");

/** A logger that keeps the warnings (the plugin warns at start when an `optimizeDeps.include` pre-bundles the package again). */
function recordingLogger(): { readonly logger: Logger; readonly warnings: string[] } {
  const warnings: string[] = [];
  const base = createLogger("silent");
  return { logger: { ...base, warn: (message) => void warnings.push(message), warnOnce: (message) => void warnings.push(message) }, warnings };
}

describe("vite.config.ts in the dev server", () => {
  it("excludes @firesio/app from pre-bundling in the Worker's and the browser's environments, and pre-bundles its imports through it", async () => {
    const { logger, warnings } = recordingLogger();
    const config = await resolveConfig({ root, configFile: join(root, "vite.config.ts"), customLogger: logger, logLevel: "warn" }, "serve");
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
});
