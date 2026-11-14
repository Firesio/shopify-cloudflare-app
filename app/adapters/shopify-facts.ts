import { createAdminClient, fetchShopIdentity } from "@firesio/shopify";
import { z } from "zod";
import type { ShopFactsPort } from "~/core/shops/after-auth";

const SETTINGS = `query AppShopSettings { shop { ianaTimezone plan { partnerDevelopment } } }`;

const settingsSchema = z.object({ shop: z.object({ ianaTimezone: z.string(), plan: z.object({ partnerDevelopment: z.boolean() }) }) });

export interface ShopFactsOptions {
  readonly apiVersion: string;
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number) => Promise<void>;
}

/** What Shopify says about a shop, through the library's Admin client (cost-aware throttling, retries, no token in errors). */
export function shopifyFacts(options: ShopFactsOptions): ShopFactsPort {
  const clientFor = (shop: string, accessToken: string) => createAdminClient({ fetch: options.fetch, shop, accessToken, apiVersion: options.apiVersion, sleep: options.sleep });
  return {
    async identity(shop, accessToken) {
      const result = await fetchShopIdentity(clientFor(shop, accessToken));
      return result.ok ? { shopifyShopId: result.value.shopifyShopId, name: result.value.name ?? "", email: result.value.email, contactEmail: result.value.contactEmail, url: result.value.url } : null;
    },
    async settings(shop, accessToken) {
      const result = await clientFor(shop, accessToken).query(SETTINGS, settingsSchema);
      return result.ok ? { timeZone: result.value.data.shop.ianaTimezone, isDevStore: result.value.data.shop.plan.partnerDevelopment } : null;
    },
  };
}
