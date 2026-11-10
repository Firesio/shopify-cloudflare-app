import { z } from "zod";

/**
 * The app's handle builds the hosted pricing-plans link, and it never changes
 * between visits, so it is cached per shop instead of asking Shopify's Admin
 * API on every billing page view. The only write site is `readAppHandle`
 * itself (a cold miss overwrites the key); the TTL bounds staleness if the app
 * is ever renamed. It is decoration: a failure to FETCH degrades to `null` (no
 * link), logged, and never blocks the page. A failure to CACHE a handle that was
 * fetched is only a missed optimisation: it is logged and the handle is still
 * returned, so a flaky KV write never costs the merchant their plan link.
 */
export const APP_HANDLE_CACHE_TTL_SECONDS = 60 * 60 * 24;

const cachedHandleSchema = z.object({ handle: z.string().min(1) });

const keyFor = (shop: string) => `billing:app-handle:${shop}`;

export type AppHandleDependencies = {
  readonly kv: KVNamespace;
  readonly shop: string;
  /** Asks Shopify for the app handle; throws on any failure. */
  readonly fetchHandle: () => Promise<string>;
};

async function readCached(kv: KVNamespace, shop: string): Promise<string | null> {
  const parsed = cachedHandleSchema.safeParse(await kv.get(keyFor(shop), "json"));
  return parsed.success ? parsed.data.handle : null;
}

export async function readAppHandle(dependencies: AppHandleDependencies): Promise<string | null> {
  const { kv, shop, fetchHandle } = dependencies;
  try {
    const cached = await readCached(kv, shop);
    if (cached) return cached;
    const handle = await fetchHandle();
    await cacheHandle(kv, shop, handle);
    return handle;
  } catch (error) {
    console.error(JSON.stringify({
      event: "billing.app_handle.unavailable",
      shop,
      error: errorMessage(error),
    }));
    return null;
  }
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "unknown");

/** The handle is already in hand: a failed write is logged and never discards it. */
async function cacheHandle(kv: KVNamespace, shop: string, handle: string): Promise<void> {
  try {
    await kv.put(keyFor(shop), JSON.stringify({ handle }), {
      expirationTtl: APP_HANDLE_CACHE_TTL_SECONDS,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "billing.app_handle.cache_write_failed",
      shop,
      error: errorMessage(error),
    }));
  }
}
