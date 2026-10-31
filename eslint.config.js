// ESLint 10 flat config.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      // Claude config — not our source.
      ".claude/**",
      // Agent skills installed on a developer machine — not our source.
      ".agents/**",
      // Skills written for coding agents (markdown, templates, a python script): instructions, not app source.
      "agent-skills/**",
      // Throwaway design explorations (static pages with vendored three.js): prototypes, not app source.
      "docs/explorations/**",
      ".shopify-home/**",
      "build/**",
      ".react-router/**",
      "node_modules/**",
      "drizzle/**",
      "extensions/**",
      "app/types/**",
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
    // `react-hooks/incompatible-library` warns that React Compiler will skip memoizing a component that calls a library
    // whose functions it cannot memoize safely. This app does not use React Compiler, so the warning has nothing to
    // protect; the one place it fires is the console's DataTable (`useReactTable`). Scoped to that file, not global:
    // any other component that trips the rule is a real signal. Turn it back on here if the compiler is ever adopted.
    files: ["app/internal/components/data-table.tsx"],
    rules: { "react-hooks/incompatible-library": "off" },
  },
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
            "No process.env in the Workers runtime — use getEnv() from ~/request-context.server.",
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
    files: ["app/**/*.{ts,tsx}"],
    ignores: ["app/models/**", "app/wiring.server.ts", "app/wiring/**", "app/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "~/models/*",
                "~/models/**",
                "../models/*",
                "../models/**",
                "../../models/*",
                "../../models/**",
                "../../../models/*",
                "../../../models/**",
                "../../../../models/*",
                "../../../../models/**",
              ],
              message: "Repository adapters are constructed only in the composition root (~/wiring.server).",
            },
          ],
        },
      ],
    },
  },
);
