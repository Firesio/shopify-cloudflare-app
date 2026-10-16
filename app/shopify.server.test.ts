import { describe, it, expect, vi } from "vitest";
import { env } from "cloudflare:test";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { ShopRepo } from "~/models/shops.server";
import { AdminUserRepo } from "~/models/admin-users.server";
import { PushSubscriptionRepo } from "~/models/push-subscriptions.server";
import type { ShopChange } from "~/services/announce-shop-change";
import { fakeQueueBinding } from "~/test/fake-notification-queue";
import { afterAuth } from "./shopify.server";
import { apiVersion } from "./shopify-api-version";

setupTestDatabase();

const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

const SHOP = "dev-store-01.myshopify.com";

/** The shape the library hands the hook. Only `shop` is read. */
const authOf = (shop: string) => ({ session: { shop } });

/**
 * This app installs via token exchange, so `/auth/callback` never runs and
 * cannot be where an install is recorded. `afterAuth` is the only moment the
 * app is told a shop has a session — every row in `shops` starts here.
 */
describe("recording an install when a session is minted", () => {
  it("pins Shopify Admin API calls to the current stable release", () => {
    expect(apiVersion).toBe("2026-10");
  });

  it("writes a shops row for the shop the session belongs to", async () => {
    const found = await inRequest(async () => {
      await afterAuth(authOf(SHOP));
      return new ShopRepo().get(SHOP);
    });

    expect(found).toMatchObject({ shop: SHOP, uninstalledAt: null });
  });

  it("does not write a raw shop domain when subscription refresh is degraded", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await inRequest(() => afterAuth(authOf(SHOP), async () => {
      throw new Error("Partner API unavailable");
    }));

    expect(error).toHaveBeenCalledTimes(1);
    const record = String(error.mock.calls[0]?.[0]);
    expect(record).toContain('"event":"subscription.refresh_failed"');
    expect(record).toMatch(/"shopHash":"[a-f0-9]{64}"/);
    expect(record).not.toContain(SHOP);
    expect(record).toContain("Partner API unavailable");
    error.mockRestore();
  });

  it("makes the shop visible to the internal console's list", async () => {
    // The reported symptom: a store with a live session showing nowhere in
    // /internal/shops, because nothing had ever written its row.
    const listed = await inRequest(async () => {
      await afterAuth(authOf(SHOP));
      return new ShopRepo().listAll();
    });

    expect(listed.map((row) => row.shop)).toEqual([SHOP]);
  });

  it("leaves ONE row when a session is minted again", async () => {
    // Offline tokens expire, so the hook fires repeatedly over a shop's life.
    // Anything less than idempotent would multiply the shop on every renewal.
    const listed = await inRequest(async () => {
      await afterAuth(authOf(SHOP));
      await afterAuth(authOf(SHOP));
      await afterAuth(authOf(SHOP));
      return new ShopRepo().listAll();
    });

    expect(listed).toHaveLength(1);
  });

  it("revives a shop that had uninstalled, rather than leaving it uninstalled", async () => {
    const found = await inRequest(async () => {
      const repo = new ShopRepo();
      await repo.recordInstall(SHOP, 1_000);
      await repo.applyUninstall(SHOP, { kind: "uninstalled", occurredAt: 2_000, externalId: "test:2000" });

      await afterAuth(authOf(SHOP));
      return repo.get(SHOP);
    });

    expect(found?.uninstalledAt).toBeNull();
  });

  it("keeps each shop's row separate", async () => {
    const other = "another-store.myshopify.com";

    const listed = await inRequest(async () => {
      await afterAuth(authOf(SHOP));
      await afterAuth(authOf(other));
      return new ShopRepo().listAll();
    });

    expect(listed.map((row) => row.shop).sort()).toEqual([other, SHOP].sort());
  });
});

/**
 * `afterAuth` fires on EVERY new session, so "a shop installed" is decided from what was recorded before it ran.
 * The announcement function is injected here; the last test runs the real wiring against a fake queue binding.
 */
describe("announcing an install to the staff", () => {
  const noRefresh = async () => undefined;

  function recorder() {
    const announced: ShopChange[] = [];
    return { announced, announce: async (change: ShopChange) => { announced.push(change); } };
  }

  it("announces the first time a shop gets a session, once, however many times it renews", async () => {
    const { announced, announce } = recorder();
    await inRequest(async () => {
      await afterAuth(authOf(SHOP), noRefresh, announce);
      await afterAuth(authOf(SHOP), noRefresh, announce);
      await afterAuth(authOf(SHOP), noRefresh, announce);
    });

    expect(announced).toHaveLength(1);
    expect(announced[0]).toMatchObject({ kind: "installed", shop: SHOP, occasion: "new" });
    expect(announced[0]?.occurredAt).toBeGreaterThan(0);
  });

  it("does not announce a shop the app already believes is installed", async () => {
    const { announced, announce } = recorder();
    await inRequest(async () => {
      await new ShopRepo().recordInstall(SHOP, 1_000);
      await afterAuth(authOf(SHOP), noRefresh, announce);
    });
    expect(announced).toEqual([]);
  });

  it("announces a reinstall after an uninstall, anchored on that uninstall, and not the renewal after it", async () => {
    const { announced, announce } = recorder();
    await inRequest(async () => {
      const repo = new ShopRepo();
      await repo.recordInstall(SHOP, 1_000);
      await repo.applyUninstall(SHOP, { kind: "uninstalled", occurredAt: 2_000, externalId: "test:2000" });
      await afterAuth(authOf(SHOP), noRefresh, announce);
      await afterAuth(authOf(SHOP), noRefresh, announce);
    });

    expect(announced).toHaveLength(1);
    expect(announced[0]).toMatchObject({ kind: "installed", shop: SHOP, occasion: "2000" });
  });

  it("announces the same installed shop twice only when it uninstalled in between", async () => {
    const { announced, announce } = recorder();
    const uninstalledAt = Date.now() + 10_000;
    await inRequest(async () => {
      const repo = new ShopRepo();
      await afterAuth(authOf(SHOP), noRefresh, announce);
      await repo.applyUninstall(SHOP, { kind: "uninstalled", occurredAt: uninstalledAt, externalId: "test:later" });
      await afterAuth(authOf(SHOP), noRefresh, announce);
    });
    expect(announced.map((change) => change.occasion)).toEqual(["new", String(uninstalledAt)]);
  });

  it("still records the install, and logs by shop hash, when announcing fails", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const found = await inRequest(async () => {
      await afterAuth(authOf(SHOP), noRefresh, async () => { throw new Error(`queue down for ${SHOP}`); });
      return new ShopRepo().get(SHOP);
    });

    expect(found).toMatchObject({ shop: SHOP, uninstalledAt: null });
    const output = log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain('"event":"shop.announce_failed"');
    expect(output).toMatch(/"shopHash":"[a-f0-9]{64}"/);
    expect(output).not.toContain(SHOP);
    log.mockRestore();
  });

  it("through the real wiring, queues one push for each enabled device of a person who wants installs, once", async () => {
    const queued = fakeQueueBinding();
    const context = Object.assign({}, env, { NOTIFICATION_QUEUE: queued.binding, SHOPIFY_APP_URL: "https://app.workmanjsc.vn" });
    await runWithRequestContext(context, async () => {
      await new AdminUserRepo().create({ id: "staff-1", email: "staff@workmanjsc.vn", name: "Sam", passwordHash: "x", role: "admin", now: 1 });
      const devices = new PushSubscriptionRepo();
      await devices.upsert("staff-1", { id: "phone", endpoint: "https://push.fake-service.invalid/phone", p256dh: "k", auth: "a", label: "Chrome on Android", kind: "phone", now: 1 });
      await devices.upsert("staff-1", { id: "laptop", endpoint: "https://push.fake-service.invalid/laptop", p256dh: "k", auth: "a", label: "Firefox on Linux", kind: "desktop", now: 1 });

      await afterAuth(authOf(SHOP), noRefresh);
      await afterAuth(authOf(SHOP), noRefresh);
    });

    // Install announcements are push-only by default (a person turns email on in their settings).
    const bodies = queued.bodies;
    expect(bodies).toHaveLength(2);
    expect(bodies).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "shop_installed", to: { push: "phone" }, dedupeKey: `shop-installed:${SHOP}:new`, scope: SHOP }),
      expect.objectContaining({ event: "shop_installed", to: { push: "laptop" }, dedupeKey: `shop-installed:${SHOP}:new` }),
    ]));
    expect(JSON.stringify(bodies)).not.toContain("fake-service");
  });
});

/**
 * `afterAuth` fires on a token mint, which is on the merchant's own request. Only what the page cannot work without
 * (the redaction fence, the shop row) is awaited; the identity query, the announcement and the Partner API run after
 * the response.
 */
describe("what a token mint makes the merchant wait for", () => {
  it("records the install but returns before a slow Partner refresh and announcement finish", async () => {
    const pending: Promise<unknown>[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const order: string[] = [];
    const slowRefresh = async () => { await gate; order.push("refreshed"); };
    const slowAnnounce = async () => { await gate; order.push("announced"); };

    const found = await runWithRequestContext(env, async () => {
      await afterAuth(authOf(SHOP), slowRefresh, slowAnnounce);
      return new ShopRepo().get(SHOP);
    }, { waitUntil: (promise) => { pending.push(promise); } });

    expect(found).toMatchObject({ shop: SHOP, uninstalledAt: null });
    expect(order).toEqual([]);
    expect(pending).toHaveLength(1);

    release();
    await Promise.all(pending);
    expect(order).toEqual(["announced", "refreshed"]);
  });

  it("logs a refresh that fails after the response, by shop hash", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pending: Promise<unknown>[] = [];
    await runWithRequestContext(env, () => afterAuth(authOf(SHOP), async () => { throw new Error("Partner API unavailable"); }), { waitUntil: (promise) => { pending.push(promise); } });
    await Promise.all(pending);

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('"event":"subscription.refresh_failed"');
    error.mockRestore();
  });
});
