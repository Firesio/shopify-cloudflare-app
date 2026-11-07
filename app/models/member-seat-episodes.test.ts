import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { memberSeatEpisodes } from "~/db/schema";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { MemberSeatEpisodeRepo } from "./member-seat-episodes.server";

setupTestDatabase();

const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const A = "alpha.myshopify.com";
const B = "beta.myshopify.com";

describe("open and findOpen", () => {
  it("opens an episode with only the moment it was detected, and finds it", async () => {
    const outcome = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      const opened = await repo.open(A, { id: "e1", now: 100 });
      return { opened, found: await repo.findOpen(A) };
    });
    const expected = { id: "e1", shop: A, detectedAt: 100, notifiedAt: null, deadlineAt: null, resolvedAt: null, outcome: null, trimmedCount: null };
    expect(outcome.opened).toEqual({ episode: expected, created: true });
    expect(outcome.found).toEqual(expected);
  });

  it("opens at most one episode per shop: a second open returns the first and writes nothing", async () => {
    const outcome = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      await repo.open(A, { id: "e1", now: 100 });
      return { again: await repo.open(A, { id: "e2", now: 200 }), rows: await db.select().from(memberSeatEpisodes) };
    });
    expect(outcome.again).toMatchObject({ created: false, episode: { id: "e1", detectedAt: 100 } });
    expect(outcome.rows).toHaveLength(1);
  });

  it("gives two reviews that open at once ONE episode: one creates it, the other reads it", async () => {
    const outcome = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      const results = await Promise.all([repo.open(A, { id: "e1", now: 1 }), repo.open(A, { id: "e2", now: 1 }), repo.open(A, { id: "e3", now: 1 })]);
      return { results, rows: await db.select().from(memberSeatEpisodes) };
    });
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.results.filter((result) => result?.created === true)).toHaveLength(1);
    const winner = outcome.rows[0]?.id;
    for (const result of outcome.results) expect(result?.episode.id).toBe(winner);
  });

  it("opens a new one once the last was resolved, and keeps the old one as the record", async () => {
    const outcome = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      await repo.open(A, { id: "e1", now: 1 });
      await repo.resolve(A, "e1", { outcome: "cancelled", trimmedCount: null, now: 2 });
      const second = await repo.open(A, { id: "e2", now: 3 });
      return { second, rows: await db.select().from(memberSeatEpisodes) };
    });
    expect(outcome.second).toMatchObject({ created: true, episode: { id: "e2" } });
    expect(outcome.rows.map((row) => row.id).sort()).toEqual(["e1", "e2"]);
  });

  it("keeps two shops apart: each has its own open episode, and neither reads the other's", async () => {
    const outcome = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      await repo.open(A, { id: "ea", now: 1 });
      await repo.open(B, { id: "eb", now: 2 });
      return { a: await repo.findOpen(A), b: await repo.findOpen(B), none: await repo.findOpen("gamma.myshopify.com") };
    });
    expect(outcome.a?.id).toBe("ea");
    expect(outcome.b?.id).toBe("eb");
    expect(outcome.none).toBeUndefined();
  });
});

describe("markNotified", () => {
  it("records the notice and the deadline, once", async () => {
    const outcome = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      await repo.open(A, { id: "e1", now: 1 });
      const first = await repo.markNotified(A, "e1", { notifiedAt: 10, deadlineAt: 70 });
      const second = await repo.markNotified(A, "e1", { notifiedAt: 20, deadlineAt: 90 });
      return { first, second, found: await repo.findOpen(A) };
    });
    expect(outcome.first).toBe(true);
    expect(outcome.second).toBe(false);
    expect(outcome.found).toMatchObject({ notifiedAt: 10, deadlineAt: 70 });
  });

  it("does nothing for a resolved episode", async () => {
    const marked = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      await repo.open(A, { id: "e1", now: 1 });
      await repo.resolve(A, "e1", { outcome: "cancelled", trimmedCount: null, now: 2 });
      return repo.markNotified(A, "e1", { notifiedAt: 10, deadlineAt: 70 });
    });
    expect(marked).toBe(false);
  });

  it("cannot reach another shop's episode by its id", async () => {
    const outcome = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      await repo.open(A, { id: "ea", now: 1 });
      const crossed = await repo.markNotified(B, "ea", { notifiedAt: 10, deadlineAt: 70 });
      return { crossed, found: await repo.findOpen(A) };
    });
    expect(outcome.crossed).toBe(false);
    expect(outcome.found).toMatchObject({ notifiedAt: null, deadlineAt: null });
  });

  it("lets exactly one of two concurrent notices record itself", async () => {
    const results = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      await repo.open(A, { id: "e1", now: 1 });
      return Promise.all([repo.markNotified(A, "e1", { notifiedAt: 10, deadlineAt: 70 }), repo.markNotified(A, "e1", { notifiedAt: 11, deadlineAt: 71 })]);
    });
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("resolve", () => {
  it("closes an open episode with its outcome and count, once", async () => {
    const outcome = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      await repo.open(A, { id: "e1", now: 1 });
      const first = await repo.resolve(A, "e1", { outcome: "trimmed", trimmedCount: 2, now: 50 });
      const second = await repo.resolve(A, "e1", { outcome: "cancelled", trimmedCount: null, now: 60 });
      return { first, second, open: await repo.findOpen(A), row: await db.select().from(memberSeatEpisodes).get() };
    });
    expect(outcome.first).toBe(true);
    expect(outcome.second).toBe(false);
    expect(outcome.open).toBeUndefined();
    expect(outcome.row).toMatchObject({ resolvedAt: 50, outcome: "trimmed", trimmedCount: 2 });
  });

  it("cannot close another shop's episode by its id", async () => {
    const outcome = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      await repo.open(A, { id: "ea", now: 1 });
      return { crossed: await repo.resolve(B, "ea", { outcome: "cancelled", trimmedCount: null, now: 2 }), open: await repo.findOpen(A) };
    });
    expect(outcome.crossed).toBe(false);
    expect(outcome.open?.id).toBe("ea");
  });
});

describe("listDue: the cron's list", () => {
  it("lists open episodes that still need their notice, and notified ones whose deadline passed, in the order each became due", async () => {
    const due = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      const shops = ["s1", "s2", "s3", "s4", "s5"].map((name) => `${name}.myshopify.com`);
      for (const [index, shop] of shops.entries()) await repo.open(shop, { id: `e${index}`, now: 10 + index });
      // s1: notified, deadline in the future. s2: notified, deadline passed. s3: never notified. s4: resolved. s5: notified, deadline passed earlier than s2's.
      await repo.markNotified(shops[0] ?? "", "e0", { notifiedAt: 1, deadlineAt: 1000 });
      await repo.markNotified(shops[1] ?? "", "e1", { notifiedAt: 1, deadlineAt: 90 });
      await repo.resolve(shops[3] ?? "", "e3", { outcome: "cancelled", trimmedCount: null, now: 20 });
      await repo.markNotified(shops[4] ?? "", "e4", { notifiedAt: 1, deadlineAt: 50 });
      return repo.listDue(100, 10);
    });
    // In the order each became due: s3 when it was detected (12), s5 at its deadline (50), s2 at its deadline (90).
    expect(due).toEqual(["s3.myshopify.com", "s5.myshopify.com", "s2.myshopify.com"]);
  });

  it("includes an episode exactly at its deadline and none just before it", async () => {
    const outcome = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      await repo.open(A, { id: "e1", now: 1 });
      await repo.markNotified(A, "e1", { notifiedAt: 1, deadlineAt: 100 });
      return { before: await repo.listDue(99, 10), at: await repo.listDue(100, 10) };
    });
    expect(outcome).toEqual({ before: [], at: [A] });
  });

  it("is bounded", async () => {
    const due = await inRequest(async () => {
      const repo = new MemberSeatEpisodeRepo();
      for (const name of ["a", "b", "c", "d"]) await repo.open(`${name}.myshopify.com`, { id: `e-${name}`, now: 1 });
      return repo.listDue(100, 2);
    });
    expect(due).toHaveLength(2);
  });

  it("reads only open episodes through the partial index, not by scanning every episode ever recorded", async () => {
    const plan = await inRequest(async () => {
      const rows = await env.DB.prepare(
        "EXPLAIN QUERY PLAN select shop from member_seat_episodes where resolved_at is null and (notified_at is null or deadline_at <= ?) order by coalesce(deadline_at, detected_at), shop limit ?",
      )
        .bind(100, 10)
        .all<{ detail: string }>();
      return rows.results.map((row) => row.detail).join(" | ");
    });
    expect(plan).toMatch(/member_seat_episodes_(due|open)_idx/);
    expect(plan).not.toMatch(/SCAN member_seat_episodes(?! USING)/);
  });
});
