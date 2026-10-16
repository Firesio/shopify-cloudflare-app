import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { forgetRequestMemo, requestMemo, runAfterResponse, runWithRequestContext } from "~/request-context.server";

describe("requestMemo", () => {
  it("runs the read once per request and hands every caller the same value", async () => {
    let reads = 0;
    const values = await runWithRequestContext(env, () => Promise.all([1, 2, 3].map(() => requestMemo("k", async () => ++reads))));
    expect(values).toEqual([1, 1, 1]);
    expect(reads).toBe(1);
  });

  it("is per request: a second request reads again", async () => {
    let reads = 0;
    await runWithRequestContext(env, () => requestMemo("k", async () => ++reads));
    await runWithRequestContext(env, () => requestMemo("k", async () => ++reads));
    expect(reads).toBe(2);
  });

  it("keeps keys apart, so one shop never sees another's value", async () => {
    const values = await runWithRequestContext(env, () => Promise.all([requestMemo("a:shop-1", async () => "one"), requestMemo("a:shop-2", async () => "two")]));
    expect(values).toEqual(["one", "two"]);
  });

  it("forgets a failure so the next caller retries, and forgets on request", async () => {
    let reads = 0;
    const outcome = await runWithRequestContext(env, async () => {
      await requestMemo("k", async () => { reads += 1; throw new Error("boom"); }).catch(() => undefined);
      const retried = await requestMemo("k", async () => ++reads);
      forgetRequestMemo("k");
      const afterForget = await requestMemo("k", async () => ++reads);
      return { retried, afterForget };
    });
    expect(outcome).toEqual({ retried: 2, afterForget: 3 });
  });

  it("memoises nothing outside a request context", async () => {
    let reads = 0;
    await requestMemo("k", async () => ++reads);
    await requestMemo("k", async () => ++reads);
    expect(reads).toBe(2);
  });
});

describe("runAfterResponse", () => {
  it("hands the work to waitUntil and returns before it finishes", async () => {
    const pending: Promise<unknown>[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let finished = false;

    await runWithRequestContext(env, () => runAfterResponse(async () => { await gate; finished = true; }, () => undefined), { waitUntil: (promise) => { pending.push(promise); } });

    expect(finished).toBe(false);
    expect(pending).toHaveLength(1);
    release();
    await Promise.all(pending);
    expect(finished).toBe(true);
  });

  it("awaits the work where there is no execution context (cron, queue, tests)", async () => {
    let finished = false;
    await runWithRequestContext(env, () => runAfterResponse(async () => { await Promise.resolve(); finished = true; }, () => undefined));
    expect(finished).toBe(true);
  });

  it("reports a failure to onError and never to the caller, with or without a context", async () => {
    const seen: unknown[] = [];
    const pending: Promise<unknown>[] = [];
    await runWithRequestContext(env, () => runAfterResponse(async () => { throw new Error("late"); }, (error) => { seen.push(error); }));
    await runWithRequestContext(env, () => runAfterResponse(async () => { throw new Error("later"); }, (error) => { seen.push(error); }), { waitUntil: (promise) => { pending.push(promise); } });
    await Promise.all(pending);
    expect(seen.map((error) => (error instanceof Error ? error.message : ""))).toEqual(["late", "later"]);
  });
});
