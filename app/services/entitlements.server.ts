import { resolveEntitlement, type EntitlementCatalogue, type EntitlementKey, type FeatureDefinition, type SubscriptionSnapshot } from "~/domain/entitlement-policy";
import type { AdoptResult, AllocateResult, CapacityPort, CheckResult, CommitResult, DeallocateResult, EntitlementCachePort, EntitlementOperationFailure, PreviewResult, ReleaseResult, ReserveResult, SubscriptionPort, UsagePort, UsageResult } from "~/ports/entitlements";
interface Dependencies<K extends string = string> { readonly subscriptions: SubscriptionPort; readonly catalogue: EntitlementCatalogue<K>; readonly capacity?: CapacityPort; readonly usage?: UsagePort; readonly cache?: EntitlementCachePort; readonly now?: () => number; readonly maxSnapshotAgeMs?: number; }
interface AllocationInput<K extends string = string> { readonly shop: string; readonly key: K; readonly allocationId: string; readonly operationId: string; }
interface ReserveInput<K extends string = string> { readonly shop: string; readonly key: K; readonly operationId: string; readonly amount: number; }
export interface EntitlementService<K extends string = string> {
  check(shop: string, key: K): Promise<CheckResult>;
  preview(shop: string, key: K): Promise<PreviewResult>;
  allocate(input: AllocationInput<K>): Promise<AllocateResult>;
  deallocate(input: AllocationInput<K>): Promise<DeallocateResult>;
  confirmAllocation(input: AllocationInput<K>): Promise<{allowed:true;allocationId:string;state:"allocated"}|EntitlementOperationFailure>;
  reserve(input: ReserveInput<K>): Promise<ReserveResult>;
  commit(input: { readonly shop: string; readonly operationId: string; readonly actualAmount?: number }): Promise<CommitResult>;
  release(input: { readonly shop: string; readonly operationId: string }): Promise<ReleaseResult>;
  invalidate(shop: string): Promise<void>;
  /** What a quota or capacity has used against what the shop's plan allows. Read-only: reserves nothing, writes no cache. */
  usage(shop: string, key: K): Promise<UsageResult>;
  /** Book a resource that already exists (one the shop had before this key was counted) as allocated, whatever the plan allows. */
  adopt(input: AllocationInput<K>): Promise<AdoptResult>;
  /**
   * The answer of `check` for every shop and key, from one read of the subscriptions: for sweeps and pages that ask many
   * things at once. A snapshot too old to trust, or a shop the port has no answer for, is `subscription_unavailable`: a batch
   * never refreshes (that would be one Partner call per shop).
   */
  resolveMany(shops: readonly string[], keys: readonly K[]): Promise<ReadonlyMap<string, ReadonlyMap<K, CheckResult>>>;
}
const invalidRequest: EntitlementOperationFailure = { allowed: false, reason: "invalid_request" };
const valid = (value: string) => value.trim().length > 0;
const capacityPort = (port: CapacityPort | undefined): CapacityPort => { if (!port) throw new Error("capacity port unavailable"); return port; };
const usagePort = (port: UsagePort | undefined): UsagePort => { if (!port) throw new Error("usage port unavailable"); return port; };
async function existingQuota(deps: Dependencies, input: ReserveInput) {
  if (!deps.usage?.find) return undefined;
  return deps.usage.find(input.shop, input.operationId);
}

async function authoritative(deps: Dependencies, shop: string) {
  let snapshot = await deps.subscriptions.current(shop);
  const now = deps.now ?? Date.now;
  const maxAge = deps.maxSnapshotAgeMs ?? 300_000;
  const stale = snapshot.verifiedAt !== undefined && (snapshot.verifiedAt > now() || now() - snapshot.verifiedAt > maxAge);
  if (stale) {
    if (!deps.subscriptions.refresh) return { status: "UNKNOWN" as const, planHandle: null, revision: snapshot.revision, verifiedAt: snapshot.verifiedAt };
    try {
      snapshot = await deps.subscriptions.refresh(shop);
    } catch (error) {
      console.error(JSON.stringify({ event: "entitlements.subscription_refresh_failed", shop, error: error instanceof Error ? error.message : "unknown" }));
      return { status: "UNKNOWN" as const, planHandle: null, revision: snapshot.revision, verifiedAt: snapshot.verifiedAt };
    }
  }
  return snapshot;
}

/**
 * The cache is read, and written, only here. `check` and the writes (`allocate`, `reserve`) go to the projection
 * and never touch it: a KV put on every check was never read by anything, and concurrent checks of one shop wrote
 * the same key several times in one request, which KV rate-limits to about one write per second per key.
 */
async function preview(deps: Dependencies, shop: string) {
  if (deps.cache) {
    try {
      const snapshot = await deps.cache.get(shop);
      if (snapshot) return snapshot;
    } catch {
      // Cache is advisory; fall through to the subscription projection.
    }
  }
  const snapshot = await authoritative(deps, shop);
  if (deps.cache) {
    try {
      await deps.cache.set(shop, snapshot, 60);
    } catch {
      // Cache is advisory; authoritative subscription data still wins.
    }
  }
  return snapshot;
}
const featureOf = (catalogue: EntitlementCatalogue, key: EntitlementKey): FeatureDefinition | undefined => Object.prototype.hasOwnProperty.call(catalogue.features, key) ? catalogue.features[key] : undefined;
const isStale = (deps: Dependencies, snapshot: SubscriptionSnapshot, at: number): boolean => snapshot.verifiedAt !== undefined && (snapshot.verifiedAt > at || at - snapshot.verifiedAt > (deps.maxSnapshotAgeMs ?? 300_000));
const remainingOf = (maximum: number | undefined, inUse: number): { readonly maximum?: number; readonly remaining?: number } => maximum === undefined ? {} : { maximum, remaining: Math.max(0, maximum - inUse) };

function makeUsage(deps: Dependencies, now: () => number) {
  return async (shop: string, key: EntitlementKey): Promise<UsageResult> => {
    if (!valid(shop) || !valid(key)) return invalidRequest;
    if (featureOf(deps.catalogue, key)?.kind === "capability") return invalidRequest;
    const resolved = resolveEntitlement(deps.catalogue, await authoritative(deps, shop), key, now());
    if (!resolved.allowed) return resolved;
    if (resolved.kind === "quota") {
      if (!deps.usage?.readUsage) throw new Error("usage reader unavailable");
      const { committed, held } = await deps.usage.readUsage(shop, key, resolved.window.key);
      return { allowed: true, kind: "quota", period: resolved.period, window: resolved.window, used: committed, held, ...remainingOf(resolved.maximum, committed + held) };
    }
    if (resolved.kind === "capacity") {
      if (!deps.capacity?.readAllocations) throw new Error("capacity reader unavailable");
      const { allocated, held } = await deps.capacity.readAllocations(shop, key);
      return { allowed: true, kind: "capacity", used: allocated, held, ...remainingOf(resolved.maximum, allocated + held) };
    }
    return invalidRequest;
  };
}
function makeAdopt(deps: Dependencies) {
  return async (input: AllocationInput): Promise<AdoptResult> => {
    if (!valid(input.shop) || !valid(input.key) || !valid(input.allocationId) || !valid(input.operationId)) return invalidRequest;
    const definition = featureOf(deps.catalogue, input.key);
    if (!definition) return { allowed: false, reason: "unknown_feature" };
    if (definition.kind !== "capacity") return invalidRequest;
    if (!deps.capacity?.adopt) throw new Error("adopt unavailable");
    // Adopting books a fact, not a grant: the plan's maximum and the subscription's state are not asked, only its revision is recorded.
    const snapshot = await authoritative(deps, input.shop);
    return deps.capacity.adopt({ shop: input.shop, key: input.key, allocationId: input.allocationId, operationId: input.operationId, subscriptionRevision: snapshot.revision });
  };
}
async function readSnapshots(deps: Dependencies, shops: readonly string[]): Promise<ReadonlyMap<string, SubscriptionSnapshot>> {
  if (deps.subscriptions.currentForShops) return deps.subscriptions.currentForShops(shops);
  const snapshots = new Map<string, SubscriptionSnapshot>();
  for (const shop of shops) snapshots.set(shop, await deps.subscriptions.current(shop));
  return snapshots;
}
function makeResolveMany<K extends string>(deps: Dependencies<K>, now: () => number) {
  return async (shops: readonly string[], keys: readonly K[]): Promise<ReadonlyMap<string, ReadonlyMap<K, CheckResult>>> => {
    const unique = [...new Set(shops)];
    const usable = unique.filter(valid);
    const snapshots = usable.length === 0 ? new Map<string, SubscriptionSnapshot>() : await readSnapshots(deps, usable);
    const at = now();
    const answerOf = (shop: string, key: K): CheckResult => {
      if (!valid(shop) || !valid(key)) return invalidRequest;
      const snapshot = snapshots.get(shop);
      if (!snapshot || isStale(deps, snapshot, at)) return { allowed: false, reason: "subscription_unavailable" };
      return resolveEntitlement(deps.catalogue, snapshot, key, at);
    };
    return new Map(unique.map((shop) => [shop, new Map(keys.map((key) => [key, answerOf(shop, key)]))]));
  };
}
function makeCheck(deps: Dependencies, now: () => number) {
  return async (shop: string, key: EntitlementKey): Promise<CheckResult> => {
    if (!valid(shop) || !valid(key)) return invalidRequest;
    const snapshot = await authoritative(deps, shop);
    if (isStale(deps, snapshot, now())) return { allowed: false, reason: "subscription_unavailable" };
    return resolveEntitlement(deps.catalogue, snapshot, key, now());
  };
}
function makePreview(deps: Dependencies, now: () => number) {
  return async (shop: string, key: EntitlementKey): Promise<PreviewResult> => {
    if (!valid(shop) || !valid(key)) return { ...invalidRequest, authoritative: false };
    const result = resolveEntitlement(deps.catalogue, await preview(deps, shop), key, now());
    return Object.assign(result, { authoritative: false as const });
  };
}
function makeAllocate(deps: Dependencies, now: () => number) {
  return async (input: AllocationInput): Promise<AllocateResult> => {
    const port = capacityPort(deps.capacity);
    if (!valid(input.shop) || !valid(input.key) || !valid(input.allocationId) || !valid(input.operationId)) return invalidRequest;
    const snapshot = await authoritative(deps, input.shop);
    const resolved = resolveEntitlement(deps.catalogue, snapshot, input.key, now());
    if (!resolved.allowed) return resolved;
    if (resolved.kind !== "capacity") return invalidRequest;
    return port.allocate({ ...input, maximum: resolved.maximum ?? Number.MAX_SAFE_INTEGER, subscriptionRevision: snapshot.revision });
  };
}
function makeReserve(deps: Dependencies, now: () => number) {
  return async (input: ReserveInput): Promise<ReserveResult> => {
    const port = usagePort(deps.usage);
    if (!valid(input.shop) || !valid(input.key) || !valid(input.operationId) || !Number.isSafeInteger(input.amount) || input.amount <= 0) return invalidRequest;
    const existing = await existingQuota(deps, input);
    if (existing) {
      if (existing.key !== input.key || existing.amount !== input.amount) return { allowed: false, reason: "operation_conflict" };
      return { allowed: true, operationId: input.operationId, amount: existing.amount, period: existing.period, subscriptionRevision: existing.subscriptionRevision, state: existing.state, replayed: true, remaining: 0 };
    }
    const snapshot = await authoritative(deps, input.shop);
    const resolved = resolveEntitlement(deps.catalogue, snapshot, input.key, now());
    if (!resolved.allowed) return resolved;
    if (resolved.kind !== "quota") return invalidRequest;
    return port.reserve({ ...input, maximum: resolved.maximum ?? Number.MAX_SAFE_INTEGER, period: resolved.window.key, periodStart: resolved.window.kind === "lifetime" ? undefined : resolved.window.start, periodEnd: resolved.window.kind === "lifetime" ? undefined : resolved.window.end, subscriptionRevision: snapshot.revision });
  };
}
export function createEntitlements<K extends string = string>(deps: Dependencies<K>): EntitlementService<K> { const now = deps.now ?? Date.now; return {
  check: makeCheck(deps, now), preview: makePreview(deps, now), allocate: makeAllocate(deps, now), reserve: makeReserve(deps, now),
  usage: makeUsage(deps, now), adopt: makeAdopt(deps), resolveMany: makeResolveMany(deps, now),
  async confirmAllocation(input) { const port = capacityPort(deps.capacity); if (!valid(input.shop) || !valid(input.key) || !valid(input.allocationId) || !valid(input.operationId)) return invalidRequest; return port.confirmAllocation(input); },
  async deallocate(input) { const port = capacityPort(deps.capacity); if (!valid(input.shop) || !valid(input.key) || !valid(input.allocationId) || !valid(input.operationId)) return invalidRequest; return port.deallocate(input); },
  async commit(input) { const port = usagePort(deps.usage); if (!valid(input.shop) || !valid(input.operationId) || (input.actualAmount !== undefined && (!Number.isSafeInteger(input.actualAmount) || input.actualAmount < 0))) return invalidRequest; return port.commit(input); },
  async release(input) { const port = usagePort(deps.usage); if (!valid(input.shop) || !valid(input.operationId)) return invalidRequest; return port.release(input); },
  async invalidate(shop) {
    if (!deps.cache || !valid(shop)) return;
    try {
      await deps.cache.invalidate(shop);
    } catch (error) {
      console.error(JSON.stringify({
        event: "entitlements.cache_invalidation_failed",
        shop,
        error: error instanceof Error ? error.message : "unknown",
      }));
    }
  },
}; }
