import boundaries from "eslint-plugin-boundaries";

/**
 * The architecture of an app as one table: what each kind of file may import (the layout and its reasons: `CLAUDE.md`, "Layout").
 * Imports are resolved (TypeScript resolver, so `~/x` and `../../x` are the same file), so depth and spelling do not matter, and a
 * folder's sub-folders (`app/core/<feature>/`, `app/adapters/<feature>/`, ...) are the folder's element. A file that matches no
 * element is an error (`no-unknown-files`), so a new top-level folder cannot slip past the table. `tools/architecture/boundaries.test.ts`
 * proves every row (the plugin otherwise ignores unresolved imports silently).
 *
 *   entry (root, routes.ts, entry.*) -> routes -> composition (app/firesio.server.ts) -> wiring -> adapters -> core, db
 *   routes -> ai -> core; composition -> notifications -> components -> i18n -> core
 *   db -> core's vocabularies only (`app/core/<feature>/vocabulary.ts`: value lists, imports nothing)
 *   core: pure, imports nothing of the app; db: tables only; adapters: the app's ports implemented over D1, KV, R2, Shopify, HTTP.
 *
 * The preset's services, adapters and guard are `@firesio/app`'s. `app/firesio.server.ts` is the ONE file that calls `createFiresio`
 * (a lint ban in `eslint.config.js`); `app/wiring/` builds the APP's own services and handlers from the preset's, for that file to
 * plug in, and everything else reaches the services through `firesio`. A folder the template has no file in (`adapters`, `wiring`,
 * `notifications`, `ai`, `i18n`) is a layer a derived app fills.
 */
const ROOT = `${import.meta.dirname}/`;

const elements = [
  { type: "core", pattern: "app/core", partialMatch: false },
  { type: "db", pattern: "app/db", partialMatch: false },
  // The app's own implementations of core's ports: Drizzle over `services.db`, KV, R2, Queues, the Admin GraphQL API, outside HTTP.
  { type: "adapters", pattern: "app/adapters", partialMatch: false },
  // What `app/firesio.server.ts` plugs in: the app's services for one shop (`withServices`) and its handlers (webhooks, queues, cron, hooks).
  { type: "wiring", pattern: "app/wiring", partialMatch: false },
  // The app's own mail and push messages (`defineMessages`), their texts per language and their templates.
  { type: "notifications", pattern: "app/notifications", partialMatch: false },
  { type: "components", pattern: "app/components", partialMatch: false },
  { type: "i18n", pattern: "app/i18n", partialMatch: false },
  // The app's AI features: prompts and calls, each a function that receives the shop's `ai` (`firesio.from(context).ai`) as an argument.
  { type: "ai", pattern: "app/ai", partialMatch: false },
  { type: "routes", pattern: "app/routes", partialMatch: false },
  { type: "test-support", pattern: "app/test", partialMatch: false },
  { type: "workers", pattern: "workers", partialMatch: false },
  { type: "tools", pattern: "tools/*", partialMatch: false },
];

const ENTRY = "entry";
// `app/core/<feature>/vocabulary.ts` (or `app/core/vocabulary.ts`): the value lists a feature's rows store (statuses, kinds) and the
// types read from them, the one part of core db may import (its CHECK constraints and `$type`); it imports nothing (eslint.config.js).
const VOCABULARY = "vocabulary";
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
  fromFile("test", to("core", "db", "adapters", "wiring", "notifications", "components", "i18n", "routes", "test-support", "workers", "ai")),
  fromFile("test", toComposition),
  // root.tsx is a thing under test too (its error boundary).
  fromFile("test", { to: { file: { categories: [ENTRY] } } }),
  // core is pure: it imports only itself. Time, ids and secrets come in as arguments.
  allow("core", "core"),
  // db holds the tables, nothing else: a query is an adapter's. Of core it reads only the vocabularies, so a value list is declared once.
  allow("db", "db"),
  { from: { element: { type: "db" } }, allow: { to: { file: { categories: [VOCABULARY] } } } },
  // An adapter implements a port of core over the app's tables or a binding it is handed; it never reaches `firesio` (it is given what it uses).
  allow("adapters", "adapters", "core", "db"),
  // Wiring gets the preset's services as an argument and binds adapters into core's use cases; the composition file imports it, so it
  // never imports that file back (a factory that names `firesio` while `firesio` is being typed is a circular type, TS7022).
  allow("wiring", "wiring", "core", "db", "adapters", "ai"),
  allow("notifications", "notifications", "core", "i18n", "components"),
  allow("i18n", "i18n", "core"),
  allow("components", "components", "i18n", "core"),
  // An AI feature gets `ai` from its caller: it never reaches the composition file or the database itself, so a test hands it `fakeAi()`.
  allow("ai", "ai", "core"),
  // The one file that calls `createFiresio`: it names the app's own values (plans, members, identity, schema, labels, messages) and
  // plugs in the app's own services and handlers (wiring, or an adapter directly when binding it is one line).
  fromFile(COMPOSITION, to("core", "db", "i18n", "adapters", "wiring", "notifications")),
  // Routes read input, call a use case, return the result: they get the services (the preset's and, through `withServices`, the
  // app's own) from `firesio`, never build them, and never query a table themselves (no `db`, no `adapters`, no `wiring`).
  allow("routes", "routes", "components", "i18n", "core", "ai"),
  allowComposition("routes"),
  // root.tsx, routes.ts, entry.client.tsx, entry.server.tsx.
  fromFile(ENTRY, to("routes", "components", "i18n", "core")),
  fromFile(ENTRY, toComposition),
  allow("workers", "workers", "core", "ai"),
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
      { pattern: "app/core/**/vocabulary.ts", category: VOCABULARY },
      { pattern: "app/test/server-build.ts", category: SERVER_BUILD },
    ],
    "boundaries/ignore": ["**/worker-configuration.d.ts", "app/**/+types/**"],
  },
  rules: {
    "boundaries/dependencies": ["error", { default: "disallow", policies }],
    "boundaries/no-unknown-files": "error",
  },
};
