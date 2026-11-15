import boundaries from "eslint-plugin-boundaries";

/**
 * The architecture of the template as one table: what each kind of file may import. Imports are resolved (TypeScript resolver, so
 * `~/x` and `../../x` are the same file), so depth and spelling do not matter. A file that matches no element is an error
 * (`no-unknown-files`), so a new top-level folder cannot slip past the table. `tools/architecture/boundaries.test.ts` proves the
 * resolver is active (the plugin otherwise ignores unresolved imports silently).
 *
 *   entry (root, routes.ts, entry.*) -> routes -> composition (app/firesio.server.ts) -> core, db, i18n
 *                                         components, i18n: presentation helpers; core: pure, imports nothing of the app.
 *
 * The services, the adapters and the guard are `@firesio/app`'s (the preset), so the app has no wiring and no adapters folder:
 * `app/firesio.server.ts` is the ONE file that calls `createFiresio`, and everything else reaches the services through it.
 */
const ROOT = `${import.meta.dirname}/`;

const elements = [
  { type: "core", pattern: "app/core", partialMatch: false },
  { type: "db", pattern: "app/db", partialMatch: false },
  { type: "components", pattern: "app/components", partialMatch: false },
  { type: "i18n", pattern: "app/i18n", partialMatch: false },
  { type: "routes", pattern: "app/routes", partialMatch: false },
  { type: "test-support", pattern: "app/test", partialMatch: false },
  { type: "workers", pattern: "workers", partialMatch: false },
  { type: "tools", pattern: "tools/*", partialMatch: false },
];

const ENTRY = "entry";
// `app/test/server-build.ts`: stands in for the generated server build in the end-to-end tests, so it names the entry files and the routes.
const SERVER_BUILD = "server-build";
// `app/firesio.server.ts`: a single file, so it is a file category (`boundaries/files`), not a folder element.
const COMPOSITION = "composition";
const to = (...types) => ({ to: { element: { types } } });
const toComposition = { to: { file: { categories: [COMPOSITION] } } };
const allow = (fromType, ...types) => ({ from: { element: { type: fromType } }, allow: to(...types) });
const allowComposition = (fromType) => ({ from: { element: { type: fromType } }, allow: toComposition });
const fromFile = (category, allowed) => ({ from: { file: { categories: category } }, allow: allowed });

const policies = [
  // Third-party packages (and `@firesio/app`, which is a package here) are a separate concern.
  { allow: { to: { module: { origin: ["external", "core"] } } } },
  // Tests may reach what they test plus the shared test support.
  fromFile("test", to("core", "db", "components", "i18n", "routes", "test-support", "workers")),
  fromFile("test", toComposition),
  // core is pure: it imports only itself. Time, ids and secrets come in as arguments.
  allow("core", "core"),
  allow("db", "db"),
  allow("i18n", "i18n", "core"),
  allow("components", "components", "i18n", "core"),
  // The one file that calls `createFiresio`: it names the app's own values (plans, members, identity, schema, labels).
  fromFile(COMPOSITION, to("core", "db", "i18n")),
  // Routes read input, call a use case, return the result: they get the services from `firesio`, never build them.
  allow("routes", "routes", "components", "i18n", "core", "db"),
  allowComposition("routes"),
  // root.tsx, routes.ts, entry.client.tsx, entry.server.tsx.
  fromFile(ENTRY, to("routes", "components", "i18n", "core")),
  fromFile(ENTRY, toComposition),
  allow("workers", "workers", "core"),
  allowComposition("workers"),
  fromFile(SERVER_BUILD, { to: { file: { categories: [ENTRY] } } }),
  fromFile(SERVER_BUILD, to("routes")),
  allow("test-support", "test-support", "core", "i18n"),
  allowComposition("test-support"),
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
      { pattern: "app/firesio.server.ts", category: COMPOSITION },
      { pattern: "app/test/server-build.ts", category: SERVER_BUILD },
    ],
    "boundaries/ignore": ["**/worker-configuration.d.ts", "app/**/+types/**", "app/globals.d.ts"],
  },
  rules: {
    "boundaries/dependencies": ["error", { default: "disallow", policies }],
    "boundaries/no-unknown-files": "error",
  },
};
