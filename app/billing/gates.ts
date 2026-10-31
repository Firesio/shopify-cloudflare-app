import type { AllocateResult, CheckResult, CommitResult, DeallocateResult, EntitlementOperationFailure, ReleaseResult, ReserveResult } from "~/ports/entitlements";

/**
 * The part of the entitlement service a gate reads. Its results are the service's own (`~/ports/entitlements`), so the real
 * `EntitlementService` is assignable to it, and the key is typed by the catalogue the service was built on. The members are
 * function PROPERTIES, not methods, so a key the service does not accept is a compile error rather than a silent widening.
 */
type Entitlements<K extends string = string> = {
  check: (shop: string, key: K) => Promise<CheckResult>;
  reserve: (input: { shop: string; key: K; operationId: string; amount: number }) => Promise<ReserveResult>;
  allocate: (input: { shop: string; key: K; allocationId: string; operationId: string }) => Promise<AllocateResult>;
  confirmAllocation?: (input: { shop: string; key: K; allocationId: string; operationId: string }) => Promise<{ allowed: true; allocationId: string; state: "allocated" } | EntitlementOperationFailure>;
  deallocate?: (input: { shop: string; key: K; allocationId: string; operationId: string }) => Promise<DeallocateResult>;
  commit?: (input: { shop: string; operationId: string; actualAmount?: number }) => Promise<CommitResult>;
  release?: (input: { shop: string; operationId: string }) => Promise<ReleaseResult>;
};
export function createPlanGate<K extends string = string>(input: { entitlements: Entitlements<K>; key: K }) { return { check: (shop: string) => input.entitlements.check(shop, input.key) }; }
export function createQuotaGate<K extends string = string>(input: { entitlements: Entitlements<K>; key: K; amount: number }) { return { reserve: (shop: string, operationId: string) => input.entitlements.reserve({ shop, key: input.key, operationId, amount: input.amount }), commit: input.entitlements.commit, release: input.entitlements.release }; }
export function createCapacityGate<K extends string = string>(input: { entitlements: Entitlements<K>; key: K; allocationId: string }) { return { allocate: (shop: string, operationId: string) => input.entitlements.allocate({ shop, key: input.key, allocationId: input.allocationId, operationId }), confirm: input.entitlements.confirmAllocation, deallocate: input.entitlements.deallocate }; }
