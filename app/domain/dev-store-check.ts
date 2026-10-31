/** A development store is asked about again after this long, in case it moved to a paid plan. */
export const DEV_STORE_RECHECK_MS = 24 * 60 * 60 * 1000;

export interface StoredDevStatus {
  readonly isDevStore: boolean;
  readonly checkedAt: number | null;
}

/**
 * Whether Shopify should be asked if this shop is a development store.
 *
 * A shop never asked about is asked once. A shop that answered "real store" is not asked again: a paid store does not
 * turn into a development store. A development store is asked again once a day, because the transition that matters
 * is one moving to a paid plan, which would otherwise keep it out of MRR for good.
 */
export function shouldCheckDevStatus(stored: StoredDevStatus, now: number): boolean {
  if (stored.checkedAt === null) return true;
  if (!stored.isDevStore) return false;
  return now - stored.checkedAt >= DEV_STORE_RECHECK_MS;
}
