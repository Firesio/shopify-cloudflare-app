// ESLint 10 flat config.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { boundariesConfig } from "./eslint.boundaries.js";

// `no-restricted-imports` is one rule: a later block that matches a file REPLACES an earlier block's list for it, so each block below
// repeats the bans it inherits (`ONLY_COMPOSITION_BUILDS`, `NO_REACT`, `NO_WORKER_ENV`).
const ONLY_COMPOSITION_BUILDS = { name: "@firesio/app", importNames: ["createFiresio"], message: "app/firesio.server.ts is the one call of createFiresio: reach the services through `firesio`." };
const NO_REACT = [
  { name: "react", message: "No React here: presentation is app/components (and the routes that render it)." },
  { name: "react-dom", message: "No React here: presentation is app/components (and the routes that render it)." },
  { name: "react-router", message: "No framework here: routes read the request and pass plain values in." },
];
const NO_WORKER_ENV = { group: ["cloudflare:*"], message: "The Worker env and bindings are handed in as arguments (from `firesio.services()` or the preset's `services`), never read here." };
const NO_QUERY_BUILDER = { group: ["drizzle-orm", "drizzle-orm/*"], message: "A query is an adapter's (app/adapters/<feature>/): this layer receives a port." };
const NO_PACKAGE_PAGES = { group: ["@firesio/app/ui", "@firesio/app/ui/*"], message: "The package's pages are React: mounted by app/routes, never imported here." };

export default tseslint.config(
  {
    ignores: [
      // Claude config — not our source.
      ".claude/**",
      "build/**",
      ".react-router/**",
      "node_modules/**",
      "drizzle/**",
      "extensions/**",
      // The libraries ship TypeScript source, so node_modules holds .ts files: never lint what we do not own.
      "tools/**/node_modules/**",
      "worker-configuration.d.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  // `configs.flat[...]` is the flat-config variant; the top-level
  // `configs["recommended-latest"]` is still eslintrc-shaped (plugins as an
  // array), which ESLint 10 rejects.
  reactHooks.configs.flat["recommended-latest"],
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // `const { passwordHash: _x, ...safe } = user` is how a field is
      // deliberately DISCARDED. Allow the underscore convention so stripping a
      // secret from an object does not need an eslint-disable.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // The Workers runtime has no `process`; app code reads config from `env` (`cloudflare:workers`, through
      // `firesio.services()`). Config files (below) are exempt — they run in Node under Vite/the CLI.
      "no-restricted-globals": [
        "error",
        {
          name: "process",
          message:
            "No process.env in the Workers runtime: use `env` from cloudflare:workers.",
        },
      ],
    },
  },
  {
    // Build-time config + Node scripts: these DO run in Node.
    files: [
      "*.config.ts",
      "*.config.js",
      "react-router.config.ts",
      "scripts/**/*.mjs",
    ],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      "no-restricted-globals": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      // Same underscore convention as the app code: `const { env: _env, ...rest }`
      // is how a key is deliberately discarded. Repeated here because the .ts
      // block above does not match .mjs scripts — and it must be the
      // typescript-eslint rule, since that plugin's recommended config applies to
      // these files too and would otherwise win.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Size caps for everything we write (docs/architecture.md section 9): a file at most 400 lines, a function at most 40.
    files: ["app/**/*.{ts,tsx}", "workers/**/*.ts", "tools/**/*.ts"],
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 40, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Time, ids and randomness come from the preset's composition root (`firesio.services().runtime`), so tests can fix them and
    // core never sees a hidden clock. A Date from a value (`new Date(ms)`) is fine; reading "now" is not.
    files: ["app/**/*.{ts,tsx}", "workers/**/*.ts"],
    ignores: ["app/test/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Take the time from firesio.services().runtime." },
        { object: "crypto", property: "randomUUID", message: "Take ids from firesio.services().runtime." },
        { object: "Math", property: "random", message: "Take randomness as an argument (firesio.services().runtime for ids)." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "Take the time from firesio.services().runtime." },
        // `crypto.randomUUID` above only sees the bare global; this is the same call through `globalThis`, `self` or `window`.
        { selector: "MemberExpression[property.name='randomUUID'][object.type='MemberExpression'][object.property.name='crypto']", message: "Take ids from firesio.services().runtime." },
      ],
    },
  },
  {
    // `createFiresio` is called once, in app/firesio.server.ts; every other file reaches what it built through `firesio`.
    // A test may build a firesio of its own to try an option the app does not set.
    files: ["app/**/*.{ts,tsx}", "workers/**/*.ts"],
    ignores: ["app/firesio.server.ts", "app/test/**", "**/*.test.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { paths: [ONLY_COMPOSITION_BUILDS] }] },
  },
  {
    // core is pure: no framework, no I/O, no query, no Worker env; the preset (the package's root) is the composition file's.
    files: ["app/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@firesio/app", message: "core/ declares and decides; the preset is app/firesio.server.ts's (a type import is fine).", allowTypeImports: true }, ...NO_REACT],
          patterns: [NO_WORKER_ENV, NO_QUERY_BUILDER, NO_PACKAGE_PAGES, { group: ["@firesio/app/*/d1", "@firesio/app/preset/*"], message: "core/ takes ports: the D1 adapters and the preset's parts are wired outside it." }],
        },
      ],
      "no-restricted-globals": ["error", { name: "fetch", message: "core/ takes I/O as arguments; do not call fetch." }],
    },
  },
  {
    // Adapters and wiring run on the server, handed what they use: no React, no Worker env of their own.
    // Their tests (in workerd) read the test bindings (`cloudflare:test`) to hand them in.
    files: ["app/adapters/**/*.ts", "app/wiring/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: { "no-restricted-imports": ["error", { paths: [ONLY_COMPOSITION_BUILDS, ...NO_REACT], patterns: [NO_WORKER_ENV, NO_PACKAGE_PAGES] }] },
  },
  {
    // Presentation and words: props and labels in, markup out; no query and no Worker env.
    files: ["app/components/**/*.{ts,tsx}", "app/i18n/**/*.ts", "app/notifications/**/*.{ts,tsx}", "app/ai/**/*.ts"],
    ignores: ["**/*.test.{ts,tsx}"],
    rules: { "no-restricted-imports": ["error", { paths: [ONLY_COMPOSITION_BUILDS], patterns: [NO_WORKER_ENV, NO_QUERY_BUILDER] }] },
  },
  boundariesConfig,
);
