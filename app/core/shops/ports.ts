import type { PortalMessage } from "@firesio/portal-client";

/** A shop as the app stores it: what the lifecycle rules and the layout read. */
export interface ShopRecord {
  readonly shop: string;
  readonly shopifyShopId: string | null;
  readonly name: string | null;
  readonly email: string | null;
  readonly timeZone: string | null;
  readonly relationshipStatus: "INSTALLED" | "UNINSTALLED" | "REACTIVATED" | null;
  readonly relationshipOccurredAt: number | null;
  readonly installedAt: number;
  readonly blockedAt: number | null;
  readonly blockedReason: string | null;
}

export interface ShopIdentityFacts {
  readonly shopifyShopId: string;
  readonly name: string;
  readonly email: string | null;
  readonly contactEmail: string | null;
  readonly url: string | null;
}

/**
 * The `shops` table behind a port. A write that belongs with a portal event takes the built message and stores both in ONE
 * D1 batch (`enqueueStatement`), so the shop row and the event commit together or not at all.
 */
export interface ShopsPort {
  get(shop: string): Promise<ShopRecord | null>;
  /** Insert the shop or revive it, stamping the install; with the event (first install or reinstall) when there is one. */
  recordInstall(input: { readonly shop: string; readonly at: number; readonly event: PortalMessage | null }): Promise<void>;
  /** Apply an uninstall unless a newer lifecycle fact is stored. `unknown_shop` for a shop never recorded. */
  recordUninstall(input: { readonly shop: string; readonly occurredAt: number; readonly event: PortalMessage | null }): Promise<"applied" | "stale" | "unknown_shop">;
  saveIdentity(shop: string, facts: ShopIdentityFacts): Promise<void>;
  saveTimeZone(shop: string, timeZone: string): Promise<void>;
  saveDevStatus(shop: string, isDevStore: boolean, at: number): Promise<void>;
  block(shop: string, reason: string, at: number): Promise<void>;
}

/** Counts the daily snapshot needs, each one indexed SQL. */
export interface MetricsPort {
  installedOn(day: string): Promise<number>;
  uninstalledOn(day: string): Promise<number>;
  activeShops(): Promise<number>;
  /** Active, paying, non-development shops by plan handle: the app multiplies by its own price table. */
  payingShopsByPlan(): Promise<Readonly<Record<string, number>>>;
  ticketsCreatedOn(day: string): Promise<number>;
  openTickets(): Promise<number>;
}
