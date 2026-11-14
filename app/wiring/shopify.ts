import { afterAuth } from "~/core/shops/after-auth";
import { buildShopify, type ShopifyApp } from "~/adapters/shopify-app";
import { MEMBERS } from "~/core/members";
import { createServices, services } from "./services";
import { env as workerEnv } from "cloudflare:workers";

// There is no `process.env` at module load in workerd: `shopifyApp` is built from the per-request `env` binding. Memoised per
// `env` object so one isolate reuses one instance; nothing in it belongs to a shop.
const cache = new WeakMap<Env, ShopifyApp>();

export function shopify(env: Env = workerEnv): ShopifyApp {
  const existing = cache.get(env);
  if (existing !== undefined) return existing;
  const app = buildShopify({
    apiKey: env.SHOPIFY_API_KEY,
    apiSecret: env.SHOPIFY_API_SECRET,
    scopes: env.SCOPES,
    appUrl: env.SHOPIFY_APP_URL,
    customDomain: env.SHOP_CUSTOM_DOMAIN,
    sessions: env.SESSION,
    now: () => createServices(env).runtime.now(),
    onlineTokens: MEMBERS.onlineTokens,
    afterAuth: ({ session }) => afterAuth(createServices(env).afterAuthDeps, session),
  });
  cache.set(env, app);
  return app;
}

export { services };
