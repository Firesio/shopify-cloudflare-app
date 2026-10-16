import { z } from "zod";
import { ShopRepo } from "~/models/shops.server";
import { shopLog } from "~/observability/shop-log";
import { forgetRequestMemo, requestMemo } from "~/request-context.server";
import { recordShopifyIdentity } from "~/services/record-shopify-identity";
import { resolveShopTimeZone } from "~/services/shop-time-zone";
import { appRuntime } from "~/wiring/runtime.server";

const SHOP_IDENTITY_QUERY = `#graphql
  query AuthenticatedShopIdentity {
    shop {
      id
      name
      email
      contactEmail
      myshopifyDomain
      url
    }
  }
`;

const SHOP_TIME_ZONE_QUERY = `#graphql
  query AuthenticatedShopTimeZone {
    shop { ianaTimezone }
  }
`;

/**
 * The layout loader asks for the identity and the zone together, and both start by reading the same `shops` row.
 * One read per request; every write below drops it so a later read in the same request sees the write.
 */
const shopRowKey = (shop: string) => `shop-row:${shop}`;
const storedShop = (repository: ShopRepo, shop: string) => requestMemo(shopRowKey(shop), () => repository.get(shop));

const timeZoneResponse = z.object({ data: z.object({ shop: z.object({ ianaTimezone: z.string() }) }) });

/** The zone every date for this shop renders in; see `resolveShopTimeZone`. */
export function shopTimeZone(
  admin: { graphql: (query: string) => Promise<Response> },
  shop: string,
): Promise<string> {
  const repository = new ShopRepo();
  return resolveShopTimeZone(shop, {
    stored: async (domain) => (await storedShop(repository, domain))?.timeZone ?? null,
    fetch: async () => {
      const response = await admin.graphql(SHOP_TIME_ZONE_QUERY);
      if (!response.ok) return null;
      const parsed = timeZoneResponse.safeParse(await response.json());
      return parsed.success ? parsed.data.data.shop.ianaTimezone : null;
    },
    record: async (domain, timeZone) => {
      try {
        return await repository.recordTimeZone(domain, timeZone);
      } finally {
        forgetRequestMemo(shopRowKey(domain));
      }
    },
    unavailable: (domain) => shopLog("shop.time_zone_unavailable", domain),
  });
}

export async function persistShopIdentity(admin: { graphql: (query: string) => Promise<Response> }, shop: string, now = appRuntime().clock.now()) {
  const repository = new ShopRepo();
  const existing = await storedShop(repository, shop);
  if (existing?.shopifyShopId) {
    return { status: "recorded", shopifyShopId: existing.shopifyShopId } as const;
  }
  const response = await admin.graphql(SHOP_IDENTITY_QUERY);
  if (!response.ok) return { status: "failed", code: "SHOP_IDENTITY_QUERY_FAILED" };
  const body: unknown = await response.json();
  if (body !== null && typeof body === "object" && "errors" in body && Array.isArray(body.errors) && body.errors.length > 0) {
    return { status: "failed", code: "SHOP_IDENTITY_QUERY_FAILED" };
  }
  const data = body !== null && typeof body === "object" && "data" in body ? body.data : null;
  const value = data !== null && typeof data === "object" && "shop" in data ? data.shop : null;
  const identity = value !== null && typeof value === "object" && "id" in value && "myshopifyDomain" in value
    && typeof value.id === "string" && typeof value.myshopifyDomain === "string"
    ? {
        id: value.id,
        myshopifyDomain: value.myshopifyDomain,
        name: "name" in value && typeof value.name === "string" ? value.name : null,
        email: "email" in value && typeof value.email === "string" ? value.email : null,
        contactEmail: "contactEmail" in value && typeof value.contactEmail === "string" ? value.contactEmail : null,
        url: "url" in value && typeof value.url === "string" ? value.url : null,
        logoUrl: `https://${value.myshopifyDomain}/favicon.ico`,
      }
    : null;
  return recordShopifyIdentity({
    shop,
    queryShop: async () => identity,
    record: async (tenant, shopifyShopId, at, details) => {
      try {
        return await repository.recordAuthenticatedIdentity(tenant, shopifyShopId, at, details);
      } finally {
        forgetRequestMemo(shopRowKey(tenant));
      }
    },
  }, now);
}
