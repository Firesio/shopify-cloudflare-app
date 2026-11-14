import { createBlocklistReader } from "@firesio/portal-client";
import { fakeKv } from "@firesio/portal-client/testing";
import { blocklistKey, createHasher, type Hasher } from "@firesio/portal-contract";
import { describe, expect, it } from "vitest";
import { createBlocklist } from "./blocklist";

const SHOP = "block-one.myshopify.com";
function failingKv() {
  const kv = fakeKv({});
  kv.failure = new Error("kv down");
  return kv;
}

const ENTRY = { reason: "scam", addedAt: "2026-11-14T10:00:00Z" };

async function hasherOf(): Promise<Hasher> {
  const made = await createHasher("a-test-secret-of-at-least-thirty-two-characters", "test-key");
  if (!made.ok) throw new Error(made.reason);
  return made.value;
}

async function blocklistOver(kv: ReturnType<typeof fakeKv>, hasher: Hasher | null) {
  return createBlocklist({ hasher: async () => hasher, reader: (failMode, h) => createBlocklistReader(kv, { failMode, ...(h === null ? {} : { hashKeyId: h.keyId }) }) });
}

describe("the kill switch and the mail blocklist", () => {
  it("blocks a shop the portal listed, and lets everyone else through", async () => {
    const key = blocklistKey({ kind: "account", account: { kind: "shopify_shop", id: SHOP } });
    const blocklist = await blocklistOver(fakeKv({ [key]: JSON.stringify({ kind: "account", account: { kind: "shopify_shop", id: SHOP }, ...ENTRY }) }), null);
    expect(await blocklist.shopBlocked(SHOP)).toBe(true);
    expect(await blocklist.shopBlocked("other.myshopify.com")).toBe(false);
  });

  it("blocks mail to a recipient the portal listed, by hash, and to a blocked shop", async () => {
    const hasher = await hasherOf();
    const hash = await hasher.hashEmail("scammer@example.org");
    const key = blocklistKey({ kind: "recipient", hashKeyId: hasher.keyId, hash });
    const kv = fakeKv({ [key]: JSON.stringify({ kind: "recipient", hashKeyId: hasher.keyId, hash, ...ENTRY }) });
    const blocklist = await blocklistOver(kv, hasher);
    expect(await blocklist.mailBlocked(SHOP, "Scammer@Example.org")).toBe(true);
    expect(await blocklist.mailBlocked(SHOP, "friend@example.org")).toBe(false);
  });

  it("when KV fails: the kill switch fails OPEN (merchants keep working), the mail path fails CLOSED (nothing goes out)", async () => {
    const hasher = await hasherOf();
    const blocklist = await blocklistOver(failingKv(), hasher);
    expect(await blocklist.shopBlocked(SHOP)).toBe(false);
    expect(await blocklist.mailBlocked(SHOP, "friend@example.org")).toBe(true);
  });

  it("without the shared key it cannot check a recipient and does not block every mail for it", async () => {
    const blocklist = await blocklistOver(fakeKv({}), null);
    expect(await blocklist.mailBlocked(SHOP, "friend@example.org")).toBe(false);
  });
});
