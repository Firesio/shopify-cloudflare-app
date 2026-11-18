import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { firesioVite } from "@firesio/app/vite";
import { defineConfig } from "vite";

// `shopify app dev` passes the live tunnel URL as SHOPIFY_APP_URL (older CLIs:
// HOST). Compute it into a local — do NOT mutate process.env, since the
// generated types make process.env.SHOPIFY_APP_URL a literal.
const appUrl =
  process.env.SHOPIFY_APP_URL || process.env.HOST || "http://localhost";
const host = new URL(appUrl).hostname;

/**
 * `shopify app dev` injects the tunnel URL + API credentials into THIS Node
 * process. The app itself runs in workerd, which has no `process.env`, so
 * forward those values into the Worker's `vars` through the Cloudflare plugin's
 * `config` hook. Plugin `config` values take precedence over wrangler.jsonc
 * `vars`, so the live tunnel URL and real secret override the local fallbacks.
 *
 * Wired for `command === "serve"` only — never for `vite build` — so a secret
 * can never be baked into production build output. Production secrets are set
 * with `wrangler secret put`.
 */
function shopifyDevVars(): Record<string, string> {
  const vars: Record<string, string> = {};
  if (process.env.SHOPIFY_API_KEY) {
    vars.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
  }
  if (process.env.SHOPIFY_API_SECRET) {
    vars.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
  }
  if (process.env.SCOPES !== undefined) {
    vars.SCOPES = process.env.SCOPES;
  }
  const injectedAppUrl = process.env.SHOPIFY_APP_URL || process.env.HOST;
  if (injectedAppUrl) {
    vars.SHOPIFY_APP_URL = injectedAppUrl;
  }
  return vars;
}

// @react-router/dev re-evaluates this file to build a "child compiler" (a second
// Vite server, used only for CSS). It would start a second workerd, a second
// remote AI session and a second dependency optimizer on the same cache.
const configLoadsKey = Symbol.for("vite-config-loads");
const previousLoads = Reflect.get(globalThis, configLoadsKey);
const configLoads = typeof previousLoads === "number" ? previousLoads + 1 : 1;
Reflect.set(globalThis, configLoadsKey, configLoads);
const isChildCompiler = configLoads > 1;

export default defineConfig(({ command }) => ({
  // Vite 8 resolves tsconfig `paths` (the `~/*` alias) natively.
  resolve: { tsconfigPaths: true },
  // Only constrain host/port when running behind the Shopify CLI tunnel. Do NOT add a custom
  // `server.hmr`/`server.cors` here — it breaks the @cloudflare/vite-plugin dev
  // runner (it fails to load the Worker entry).
  server: {
    ...(host !== "localhost" ? { allowedHosts: [host] } : {}),
    ...(process.env.PORT ? { port: Number(process.env.PORT) } : {}),
  },
  // Dependency pre-bundling (`optimizeDeps`) is not configured here, on purpose. `firesioVite()` (below) excludes `@firesio/app`
  // from it in every environment, the Worker's and the browser's, and pre-bundles what the package imports instead (its route
  // modules are `.tsx` files Vite serves from source, so a pre-bundled copy of the package would hand a page a second copy of its
  // router context: every package page answered 500 "No value found for context" in `npm run dev`). React Router's plugin
  // pre-bundles React and the router; Vite's scan of the route modules finds what the app's own files import (`zod`,
  // `@shopify/app-bridge-types`). Add an entry here only for a package of the APP's that the scan misses (the symptom: "new
  // dependencies found ... reloading" under `DEBUG=vite:deps`), and never `@firesio/app` or one of its subpaths: the plugin warns
  // at start, because Vite would pre-bundle the package again.
  plugins: [
    // Runs the app in the Workers runtime (workerd) during dev, matching
    // production. Bindings are real (D1, KV) via Miniflare.
    ...(isChildCompiler && command === "serve"
      ? []
      : [
          cloudflare({
            viteEnvironment: { name: "ssr" },
            // The `AI` binding has no local simulation. With remote bindings on (the plugin default) every `dev` start
            // opens a preview session on Cloudflare (api.cloudflare.com, a workers.dev preview, tail.developers.workers.dev:
            // observed with a connection log), needs wrangler login and network, and bills AI calls. Off by default: an AI
            // call then fails inside the adapter as an AiError and the feature degrades to "no draft". Run
            // `DEV_REMOTE_BINDINGS=1 npm run dev` when working on an AI feature.
            remoteBindings: process.env.DEV_REMOTE_BINDINGS === "1",
            ...(command === "serve"
              ? { config: () => ({ vars: shopifyDevVars() }) }
              : {}),
          }),
        ]),
    reactRouter(),
    // One copy of `@firesio/app` in the dev server (see the note on dependency pre-bundling above); the production build is not affected.
    firesioVite(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  // The Worker (`ssr`) bundle ships unminified by default: ~6 MB that every cold isolate has to parse before its
  // first request, and the merchant who lands on a cold isolate waits for it. Names are kept (`keepNames`) because
  // the code logs `error.name` and compares class names.
  environments: {
    ssr: {
      build: {
        rolldownOptions: {
          output: { minify: { compress: { keepNames: { function: true, class: true } }, mangle: { keepNames: { function: true, class: true } } } },
        },
      },
    },
  },
}));
