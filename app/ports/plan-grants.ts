import type { NewShopPlanGrant, ShopPlanGrant } from "~/db/schema/plan-grants";

export interface PlanGrantsPort {
  findActiveGrant(shop: string, now: number): Promise<ShopPlanGrant | null>;
  /** The active grant of each shop, a shop without one absent; for a sweep or a batch read. */
  findActiveGrants(shops: readonly string[], now: number): Promise<ReadonlyMap<string, ShopPlanGrant>>;
  listGrantsForShop(shop: string): Promise<ShopPlanGrant[]>;
  countActiveGrants(now: number): Promise<number>;
  createGrant(grant: NewShopPlanGrant): Promise<ShopPlanGrant>;
  revokeGrant(shop: string, grantId: string, revokedBy: string, now: number): Promise<boolean>;
}
