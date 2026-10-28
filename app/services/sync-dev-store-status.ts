import { shouldCheckDevStatus, type StoredDevStatus } from "~/domain/dev-store-check";

export interface DevStoreStatusPorts {
  /** What is stored for the shop; null when there is no row. */
  readonly stored: (shop: string) => Promise<StoredDevStatus | null>;
  /** Ask Shopify whether the shop is a partner development shop; null when it cannot say. */
  readonly fetch: (shop: string) => Promise<boolean | null>;
  readonly record: (shop: string, isDevStore: boolean, checkedAt: number) => Promise<void>;
  readonly unavailable: (shop: string) => Promise<void>;
  readonly changed: (shop: string, isDevStore: boolean) => Promise<void>;
}

export type DevStoreSync = "skipped" | "changed" | "unchanged" | "unavailable";

/**
 * Keep `shops.is_dev_store` equal to what Shopify says, so a development store never counts toward real MRR and a
 * store that moved to a paid plan starts to. `shouldCheckDevStatus` decides whether Shopify is asked at all.
 *
 * When Shopify cannot answer, nothing is written: storing `false` after a failed call would turn every development
 * store into revenue for as long as the API is down, and storing a check time would hide the failure.
 */
export async function syncDevStoreStatus(shop: string, now: number, ports: DevStoreStatusPorts): Promise<DevStoreSync> {
  const stored = await ports.stored(shop);
  if (stored === null || !shouldCheckDevStatus(stored, now)) return "skipped";
  const isDevStore = await ports.fetch(shop);
  if (isDevStore === null) {
    await ports.unavailable(shop);
    return "unavailable";
  }
  await ports.record(shop, isDevStore, now);
  if (isDevStore === stored.isDevStore) return "unchanged";
  await ports.changed(shop, isDevStore);
  return "changed";
}
