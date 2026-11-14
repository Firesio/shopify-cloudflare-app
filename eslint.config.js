// ESLint 10 flat config.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import { boundariesConfig } from "./eslint.boundaries.js";

export default tseslint.config(
  {
    ignores: [
      // Claude config — not our source.
      ".claude/**",
      // Skills written for coding agents (markdown, templates, a python script): instructions, not app source.
      "agent-skills/**",
      // Where coding-agent tooling installs skills (third-party instructions, templates, vendored scripts): same kind as the line above.
      ".agents/**",
      // Throwaway design explorations (static pages with vendored three.js): prototypes, not app source.
      "docs/explorations/**",
      ".shopify-home/**",
      "build/**",
      ".react-router/**",
      "node_modules/**",
      "drizzle/**",
      "extensions/**",
      "app/types/**",
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
      // The Workers runtime has no `process`; app code must read config from
      // the `env` binding via getEnv(). Config files (below) are exempt —
      // they run in Node under Vite/the CLI.
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
      ".graphqlrc.ts",
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
    // Static files served as-is (no build step), such as the staff console's
    // push service worker: a worker global scope, not a window and not Node.
    files: ["public/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.serviceworker },
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
    // Time, ids and randomness come from the composition root (app/wiring), so tests can fix them and core never sees a hidden
    // clock. A Date from a value (`new Date(ms)`) is fine; reading "now" is not.
    files: ["app/**/*.{ts,tsx}", "workers/**/*.ts"],
    ignores: ["app/wiring/**", "app/test/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Take the time from services (app/wiring)." },
        { object: "crypto", property: "randomUUID", message: "Take ids from services (app/wiring)." },
        { object: "Math", property: "random", message: "Take randomness from services (app/wiring)." },
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "Take the time from services (app/wiring)." },
      ],
    },
  },
  {
    // core is pure: no framework, no I/O.
    files: ["app/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { paths: [{ name: "react-router", message: "core/ has no framework imports." }, { name: "react", message: "core/ has no framework imports." }] }],
      "no-restricted-globals": ["error", { name: "fetch", message: "core/ takes I/O as arguments; do not call fetch." }],
    },
  },
  boundariesConfig,
);
