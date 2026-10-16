import { AsyncLocalStorage } from "node:async_hooks";
import { makeDb, type Db } from "./db/client";

/**
 * Per-request context.
 *
 * workerd has no `process.env` — configuration and bindings arrive as the `env`
 * argument to the Worker's fetch handler. The Worker entry (workers/app.ts)
 * wraps every request in this AsyncLocalStorage store so server code reads env
 * via `getEnv()` and the Drizzle client via `getDb()`, with no argument
 * threading and no module-level state.
 *
 * Module-scope state would be a cross-tenant leak: one isolate is reused across
 * shops. The store is per-request, so it is safe.
 */
interface RequestContext {
  env: Env;
  db?: Db;
  /** The Worker's execution context, when the entry has one. Absent in cron, queue, tests and scripts. */
  ctx?: Pick<ExecutionContext, "waitUntil">;
  /** Per-request memo, see `requestMemo`. */
  memo?: Map<string, Promise<unknown>>;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(env: Env, fn: () => T, ctx?: Pick<ExecutionContext, "waitUntil">): T {
  return storage.run({ env, ctx }, fn);
}

export function getEnv(): Env {
  const store = storage.getStore();
  if (!store) {
    throw new Error("getEnv() called outside of a request context");
  }
  return store.env;
}

/** The only way app code obtains a DB handle. Memoized per request. */
export function getDb(): Db {
  const store = storage.getStore();
  if (!store) {
    throw new Error("getDb() called outside of a request context");
  }
  store.db ??= makeDb(store.env.DB);
  return store.db;
}

function isPromiseOf<T>(value: unknown): value is Promise<T> {
  return value instanceof Promise;
}

/**
 * Run `make` once per request for `key` and hand every caller the same promise. For a read that several independent
 * call sites in one request would otherwise repeat (the subscription snapshot is read once per entitlement check).
 * Keys must carry the shop. A rejected promise is forgotten so the next caller retries. Outside a request context
 * (a script, a unit test of a pure service) nothing is memoised.
 */
export function requestMemo<T>(key: string, make: () => Promise<T>): Promise<T> {
  const store = storage.getStore();
  if (!store) return make();
  store.memo ??= new Map();
  const existing = store.memo.get(key);
  // Entries are only ever written below, by the call that made them, so a hit for this key holds this call's kind of value.
  if (isPromiseOf<T>(existing)) return existing;
  const created = make();
  store.memo.set(key, created);
  created.catch(() => { if (store.memo?.get(key) === created) store.memo.delete(key); });
  return created;
}

/** Drop a memoised value after the write that makes it stale. */
export function forgetRequestMemo(key: string): void {
  storage.getStore()?.memo?.delete(key);
}

/**
 * Do work the response does not need, after the response is on its way. With an execution context it rides
 * `ctx.waitUntil` (shared budget of about 30 s, then cancelled: only decoration and work something else repairs).
 * Without one (cron, queue, tests, scripts) it is simply awaited, so callers behave the same everywhere and tests
 * see the effect. A failure is passed to `onError` and never reaches the caller.
 */
export async function runAfterResponse(task: () => Promise<void>, onError: (error: unknown) => Promise<void> | void): Promise<void> {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      await onError(error);
    }
  };
  const ctx = storage.getStore()?.ctx;
  if (ctx) ctx.waitUntil(guarded());
  else await guarded();
}
