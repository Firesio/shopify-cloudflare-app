import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { Session } from "@shopify/shopify-api";
import { KVSessionStorage, ttlSeconds } from "./session-storage";

const NOW = Date.now();

describe("ttlSeconds", () => {
  it("returns undefined when there is no expiry", () => {
    expect(ttlSeconds(undefined, Date.now())).toBeUndefined();
  });

  it("clamps to KV's 60s minimum", () => {
    const now = Date.now();
    expect(ttlSeconds(new Date(now + 1_000), now)).toBe(60);
  });

  it("converts a future expiry to whole seconds", () => {
    const now = Date.now();
    expect(ttlSeconds(new Date(now + 3_600_000), now)).toBe(3600);
  });
});

function offlineSession(shop: string) {
  return new Session({
    id: `offline_${shop}`,
    shop,
    state: "state",
    isOnline: false,
    accessToken: "token",
    scope: "write_products",
  });
}

describe("KVSessionStorage", () => {
  it("round-trips a session", async () => {
    const storage = new KVSessionStorage(env.SESSION, () => NOW);
    const session = offlineSession("round-trip.myshopify.com");

    expect(await storage.storeSession(session)).toBe(true);
    const loaded = await storage.loadSession(session.id);

    expect(loaded?.shop).toBe(session.shop);
    expect(loaded?.accessToken).toBe("token");
  });

  it("finds sessions by shop", async () => {
    const storage = new KVSessionStorage(env.SESSION, () => NOW);
    const session = offlineSession("by-shop.myshopify.com");
    await storage.storeSession(session);

    const found = await storage.findSessionsByShop("by-shop.myshopify.com");

    expect(found.map((s) => s.id)).toContain(session.id);
  });

  it("deletes a session and its shop index entry", async () => {
    const storage = new KVSessionStorage(env.SESSION, () => NOW);
    const session = offlineSession("deleted.myshopify.com");
    await storage.storeSession(session);

    await storage.deleteSession(session.id);

    expect(await storage.loadSession(session.id)).toBeUndefined();
    expect(await storage.findSessionsByShop("deleted.myshopify.com")).toEqual([]);
  });

});

describe("KVSessionStorage deletion", () => {
  it("deletes only sessions belonging to requested shop", async () => {
    const storage = new KVSessionStorage(env.SESSION, () => NOW);
    const target = offlineSession("purge-target.myshopify.com");
    const other = offlineSession("purge-other.myshopify.com");
    await storage.storeSession(target);
    await storage.storeSession(other);

    const targetSessions = await storage.findSessionsByShop(target.shop);
    await storage.deleteSessions(targetSessions.map(({ id }) => id));

    expect(await storage.loadSession(target.id)).toBeUndefined();
    expect(await storage.loadSession(other.id)).toBeDefined();
    expect(await storage.findSessionsByShop(other.shop)).toHaveLength(1);
  });

  /**
   * An offline session whose shop index entry was lost (a quick uninstall and reinstall can do it) must still be found:
   * the merchant's own requests load a session by id and keep working, but every background job that asks for the
   * shop's sessions would find "no session" and skip. The offline session is the record every Admin call outside a
   * merchant's request needs, so it is read by its id as well as through the index.
   */
});

describe("KVSessionStorage the offline session and the shop index", () => {
  it("finds the offline session by its id when its shop index entry is missing", async () => {
    const session = offlineSession("orphan.myshopify.com");
    await env.SESSION.put(`session:${session.id}`, JSON.stringify(session.toPropertyArray()));
    const found = await new KVSessionStorage(env.SESSION, () => NOW).findSessionsByShop(session.shop);
    expect(found.map((s) => s.id)).toEqual([session.id]);
  });

  it("returns the offline session once when the index lists it as well", async () => {
    const storage = new KVSessionStorage(env.SESSION, () => NOW);
    const session = offlineSession("listed-once.myshopify.com");
    await storage.storeSession(session);

    const found = await storage.findSessionsByShop(session.shop);

    expect(found.map((s) => s.id)).toEqual([session.id]);
  });

  it("never reads another shop's session when the index is missing", async () => {
    const mine = offlineSession("mine.myshopify.com");
    const other = offlineSession("other.myshopify.com");
    await env.SESSION.put(`session:${other.id}`, JSON.stringify(other.toPropertyArray()));

    const found = await new KVSessionStorage(env.SESSION, () => NOW).findSessionsByShop(mine.shop);

    expect(found).toEqual([]);
  });

  /**
   * KV is eventually consistent across locations: a session just written elsewhere can read as missing here for up to
   * a minute (a miss is cached) while its index entry already lists. Deleting the entry on that read would orphan a
   * live session for good, so listing is a pure read. `deleteSession` is what removes an entry.
   */
});

describe("KVSessionStorage KV eventual consistency", () => {
  it("keeps a shop index entry whose session cannot be read right now", async () => {
    const storage = new KVSessionStorage(env.SESSION, () => NOW);
    const session = offlineSession("lagging.myshopify.com");
    await storage.storeSession(session);
    const deletes: string[] = [];
    const lagging = new Proxy(env.SESSION, {
      get(target, property) {
        if (property === "get") {
          return async (key: string, ...rest: unknown[]) =>
            key.startsWith("session:") ? null : Reflect.apply(target.get, target, [key, ...rest]);
        }
        if (property === "delete") {
          return async (key: string) => {
            deletes.push(key);
            await target.delete(key);
          };
        }
        const member = Reflect.get(target, property, target);
        return typeof member === "function" ? member.bind(target) : member;
      },
    });

    const found = await new KVSessionStorage(lagging, () => NOW).findSessionsByShop(session.shop);

    expect(found).toEqual([]);
    expect(deletes).toEqual([]);
    expect(await env.SESSION.get(`shopidx:${session.shop}:${session.id}`)).not.toBeNull();
  });

  it("removes a stale shop index when the primary session has expired", async () => {
    const storage = new KVSessionStorage(env.SESSION, () => NOW);
    const session = offlineSession("stale-index.myshopify.com");
    await storage.storeSession(session);
    await env.SESSION.delete(`session:${session.id}`);
    await storage.deleteSession(session.id);
    expect(await storage.findSessionsByShop(session.shop)).toEqual([]);
  });

});

describe("KVSessionStorage expiry", () => {
  it("gives an offline session no KV expiry, so its refresh token outlives the access token", async () => {
    const storage = new KVSessionStorage(env.SESSION, () => NOW);
    const session = offlineSession("offline.myshopify.com");
    // An expiry an offline session would carry with expiring access tokens.
    session.expires = new Date(Date.now() + 60 * 60 * 1000);

    await storage.storeSession(session);

    // Still present, and stored with no expirationTtl — the record must outlive
    // the token it holds.
    expect(await storage.loadSession(session.id)).toBeDefined();
  });
});
