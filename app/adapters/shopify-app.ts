// Workers runtime adapter (Web Crypto + global fetch): must be imported before shopifyApp.
import "@shopify/shopify-api/adapters/cf-worker";
import { AppDistribution, LogSeverity, shopifyApp } from "@shopify/shopify-app-react-router/server";
import { apiVersion } from "~/core/api-version";
import { POLARIS_URL } from "~/core/polaris";
import { KVSessionStorage } from "./session-storage";

export interface ShopifyConfig {
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly scopes: string;
  readonly appUrl: string;
  readonly customDomain: string;
  readonly sessions: KVNamespace;
  /** The clock (epoch ms), from the composition root. */
  readonly now: () => number;
  /** Ask for an online token too: it carries who the person is (verified email, name, whether they own the store). */
  readonly onlineTokens: boolean;
  readonly afterAuth: (context: { readonly session: { readonly shop: string; readonly accessToken?: string | undefined } }) => Promise<void>;
}

/** `shopifyApp` for one request's env: there is no `process.env` in workerd, so it cannot be built at import time. */
export function buildShopify(config: ShopifyConfig) {
  return shopifyApp({
    apiKey: config.apiKey,
    apiSecretKey: config.apiSecret,
    apiVersion,
    scopes: config.scopes.split(",").filter(Boolean),
    appUrl: config.appUrl,
    authPathPrefix: "/auth",
    sessionStorage: new KVSessionStorage(config.sessions, config.now),
    // The library logs "Authenticating admin request" at Info on every request: a billed log line each. Warnings and errors still print.
    logger: { level: LogSeverity.Warning },
    distribution: AppDistribution.AppStore,
    // The release of Polaris the preload `Link` header names; `EmbeddedProvider` loads the same one.
    polarisUrl: POLARIS_URL,
    useOnlineTokens: config.onlineTokens,
    hooks: { afterAuth: config.afterAuth },
    future: { expiringOfflineAccessTokens: true },
    ...(config.customDomain === "" ? {} : { customShopDomains: [config.customDomain] }),
  });
}

export type ShopifyApp = ReturnType<typeof buildShopify>;
