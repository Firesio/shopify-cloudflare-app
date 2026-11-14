import boundaries from "eslint-plugin-boundaries";

/**
 * The architecture of the template as one table: what each kind of file may import. Imports are resolved (TypeScript resolver, so
 * `~/x` and `../../x` are the same file), so depth and spelling do not matter. A file that matches no element is an error
 * (`no-unknown-files`), so a new top-level folder cannot slip past the table. `tools/architecture/boundaries.test.ts` proves the
 * resolver is active (the plugin otherwise ignores unresolved imports silently).
 *
 *   entry (root, routes.ts, entry.*) -> routes -> wiring -> adapters -> core
 *                                         components, i18n: presentation helpers; core: pure, imports nothing of the app.
 */
const ROOT = `${import.meta.dirname}/`;

const elements = [
  { type: "core", pattern: "app/core", partialMatch: false },
  { type: "adapters", pattern: "app/adapters", partialMatch: false },
  { type: "wiring", pattern: "app/wiring", partialMatch: false },
  { type: "components", pattern: "app/components", partialMatch: false },
  { type: "i18n", pattern: "app/i18n", partialMatch: false },
  { type: "routes", pattern: "app/routes", partialMatch: false },
  { type: "test-support", pattern: "app/test", partialMatch: false },
  { type: "workers", pattern: "workers", partialMatch: false },
  { type: "tools", pattern: "tools/*", partialMatch: false },
];

const ENTRY = "entry";
const to = (...types) => ({ to: { element: { types } } });
const allow = (fromType, ...types) => ({ from: { element: { type: fromType } }, allow: to(...types) });

const policies = [
  // Third-party packages (and the @firesio libraries, which are packages here) are a separate concern.
  { allow: { to: { module: { origin: ["external", "core"] } } } },
  // Tests may reach what they test plus the shared test support.
  { from: { file: { categories: "test" } }, allow: to("core", "adapters", "wiring", "components", "i18n", "routes", "test-support", "workers") },
  // core is pure: it imports only itself. Time, ids and secrets come in as arguments.
  allow("core", "core"),
  allow("i18n", "i18n", "core"),
  // Adapters implement the ports core declares; they never reach upward.
  allow("adapters", "adapters", "core"),
  allow("components", "components", "i18n", "core"),
  // Only the composition root (wiring) chooses adapters.
  allow("wiring", "wiring", "adapters", "core", "i18n"),
  // Routes read input, call a use case, return the result: they get services from wiring, never an adapter.
  allow("routes", "routes", "components", "i18n", "core", "wiring"),
  // root.tsx, routes.ts, entry.client.tsx, entry.server.tsx.
  { from: { file: { categories: ENTRY } }, allow: to("routes", "components", "i18n", "core", "wiring") },
  allow("workers", "workers", "wiring", "core"),
  allow("test-support", "test-support", "core", "adapters", "wiring", "i18n"),
  allow("tools", "tools"),
];

export const boundariesConfig = {
  files: ["app/**/*.{ts,tsx}", "workers/**/*.ts", "tools/**/*.ts"],
  plugins: { boundaries },
  settings: {
    "boundaries/root-path": ROOT,
    "import/resolver": { typescript: { noWarnOnMultipleProjects: true, project: [`${ROOT}tsconfig.json`] } },
    "boundaries/elements": elements,
    "boundaries/files": [
      { pattern: "**/*.test.{ts,tsx}", category: "test" },
      { pattern: "app/{root.tsx,routes.ts,entry.client.tsx,entry.server.tsx}", category: ENTRY },
    ],
    "boundaries/ignore": ["**/worker-configuration.d.ts", "app/**/+types/**", "app/globals.d.ts"],
  },
  rules: {
    "boundaries/dependencies": ["error", { default: "disallow", policies }],
    "boundaries/no-unknown-files": "error",
  },
};
