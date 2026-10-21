// Environment the Shopify CLI wrapper adds for `app dev` only (pure, so it is testable).
//
// WRANGLER_LOG=error: the Cloudflare Vite plugin runs wrangler's config reader, which prints "Using secrets defined in
// .dev.vars" and "Missing required secrets: SHOPIFY_API_SECRET, ..." on every start (twice). In `npm run dev` that warning
// is wrong more often than right: the Shopify CLI injects SHOPIFY_API_SECRET itself, and the others are optional locally.
// `secrets.required` still protects the production deploy, which is where a missing secret matters. Errors still print.
// Set WRANGLER_LOG=warn (or debug) yourself to see wrangler's warnings again.

const isAppDev = (args) => args[0] === "app" && args[1] === "dev" && !args.includes("--help");

/** Extra variables for the spawned CLI. A value the caller already set always wins. */
export function appDevEnv(args, env) {
  if (!isAppDev(args)) return {};
  return { WRANGLER_LOG: env.WRANGLER_LOG ?? "error" };
}
