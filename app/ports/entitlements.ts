import type { EntitlementDenialReason, EntitlementKey, ResolvedEntitlement, SubscriptionSnapshot, UsagePeriod, UsageWindow } from "~/domain/entitlement-policy";

export type OperationDenialReason = EntitlementDenialReason | "operation_conflict" | "conflict" | "quota_exhausted" | "capacity_exhausted" | "not_found" | "invalid_request" | "invalid_amount" | "invalid_state" | "subscription_unavailable";
export type EntitlementOperationFailure = { readonly allowed: false; readonly reason: OperationDenialReason };
export type EntitlementOperationResult = EntitlementOperationFailure;
export type CheckResult = ResolvedEntitlement | EntitlementOperationFailure;
export type PreviewResult = (ResolvedEntitlement | EntitlementOperationFailure) & { readonly authoritative: false };
export type ReserveResult = { readonly allowed: true; readonly operationId: string; readonly amount: number; readonly period: string; readonly subscriptionRevision: number; readonly remaining: number; readonly state?: "held"|"committed"|"released"; readonly replayed?: boolean } | EntitlementOperationFailure;
export type CommitResult = { readonly allowed: true; readonly operationId: string; readonly state: "committed"; readonly replayed?: boolean } | EntitlementOperationFailure;
export type ReleaseResult = { readonly allowed: true; readonly operationId: string; readonly state: "released" | "committed"; readonly replayed?: boolean } | EntitlementOperationFailure;
export type AllocateResult = { readonly allowed: true; readonly allocationId: string; readonly operationId: string; readonly subscriptionRevision: number; readonly remaining: number; readonly state: "held" | "allocated" } | EntitlementOperationFailure;
export type DeallocateResult = { readonly allowed: true; readonly allocationId: string; readonly operationId: string; readonly state: "released" } | EntitlementOperationFailure;
/** What a counted entitlement has used against what the plan allows. `remaining` is absent when there is no ceiling. */
export type UsageResult =
  | { readonly allowed: true; readonly kind: "quota"; readonly period: UsagePeriod; readonly window: UsageWindow; readonly used: number; readonly held: number; readonly maximum?: number; readonly remaining?: number }
  | { readonly allowed: true; readonly kind: "capacity"; readonly used: number; readonly held: number; readonly maximum?: number; readonly remaining?: number }
  | EntitlementOperationFailure;
/** An existing resource booked as allocated: `replayed` when it already was. */
export type AdoptResult = { readonly allowed: true; readonly allocationId: string; readonly operationId: string; readonly state: "allocated"; readonly replayed?: boolean } | EntitlementOperationFailure;
/** What a quota has used in one period: units committed, and units still held by an operation in flight. */
export interface QuotaUsage { readonly committed: number; readonly held: number }
/** What a capacity has in use: slots confirmed, and slots held by an attempt in flight. */
export interface CapacityUsage { readonly allocated: number; readonly held: number }

export interface SubscriptionPort {
  current(shop: string): Promise<SubscriptionSnapshot>;
  refresh?(shop: string): Promise<SubscriptionSnapshot>;
  /** Many shops in one read, for a sweep: a shop with no answer is simply absent from the map. Optional; `current` is the fallback, one shop at a time. */
  currentForShops?(shops: readonly string[]): Promise<ReadonlyMap<string, SubscriptionSnapshot>>;
}
export interface CapacityPort {
  allocate(input: { readonly shop: string; readonly key: EntitlementKey; readonly allocationId: string; readonly operationId: string; readonly maximum: number; readonly subscriptionRevision: number }): Promise<AllocateResult>;
  confirmAllocation(input: { readonly shop: string; readonly key: EntitlementKey; readonly allocationId: string; readonly operationId: string }): Promise<{allowed:true; allocationId:string; state:"allocated"}|EntitlementOperationFailure>;
  deallocate(input: { readonly shop: string; readonly key: EntitlementKey; readonly allocationId: string; readonly operationId: string }): Promise<DeallocateResult>;
  /** Book a resource that already exists as allocated, past any maximum (a plan change never evicts). Optional: only an app that adopts needs it. */
  adopt?(input: { readonly shop: string; readonly key: EntitlementKey; readonly allocationId: string; readonly operationId: string; readonly subscriptionRevision: number }): Promise<AdoptResult>;
  /** Slots in use, for a usage display. Optional: only an app that shows usage needs it. */
  readAllocations?(shop: string, key: EntitlementKey): Promise<CapacityUsage>;
}
export type ExistingQuotaOperation = {
  readonly key: EntitlementKey;
  readonly amount: number;
  readonly period: string;
  readonly subscriptionRevision: number;
  readonly state: "held" | "committed" | "released";
};
export interface UsagePort {
  find?(shop: string, operationId: string): Promise<ExistingQuotaOperation | undefined>;
  reserve(input: { readonly shop: string; readonly key: EntitlementKey; readonly operationId: string; readonly amount: number; readonly maximum: number; readonly period: string; readonly periodStart?: number; readonly periodEnd?: number; readonly subscriptionRevision: number }): Promise<ReserveResult>;
  commit(input: { readonly shop: string; readonly operationId: string; readonly actualAmount?: number }): Promise<CommitResult>;
  release(input: { readonly shop: string; readonly operationId: string }): Promise<ReleaseResult>;
  /** Units used in one period, for a usage display. Optional: only an app that shows usage needs it. */
  readUsage?(shop: string, key: EntitlementKey, period: string): Promise<QuotaUsage>;
}
export interface HeldUsagePort { listHeld(shop: string): Promise<readonly { readonly operationId: string; readonly key: string; readonly period: string; readonly amount: number }[]>; }
export interface HeldCapacityPort { listHeldAllocations(shop: string): Promise<readonly { readonly key: string; readonly allocationId: string }[]>; }
export interface EntitlementCachePort {
  get(shop: string): Promise<SubscriptionSnapshot | null>;
  set(shop: string, snapshot: SubscriptionSnapshot, ttlSeconds: number): Promise<void>;
  invalidate(shop: string): Promise<void>;
}
