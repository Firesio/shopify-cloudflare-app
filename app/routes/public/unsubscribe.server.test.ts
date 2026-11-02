import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { campaignUnsubscribes, shops } from "~/db/schema";
import { DEFAULT_AUDIENCE } from "~/domain/campaign-audience";
import { signUnsubscribeToken } from "~/lib/unsubscribe-token";
import { previewAudience } from "~/models/campaign-audience.server";
import { CampaignUnsubscribeRepo } from "~/models/campaign-unsubscribes.server";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { confirmUnsubscribe, maskAddress, readUnsubscribeLink } from "./unsubscribe.server";

setupTestDatabase();

const SECRET = "test-attachment-secret";
const db = drizzle(env.DB);
const inRequest = <T>(fn: () => Promise<T>) => runWithRequestContext(env, fn);

describe("maskAddress", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskAddress("ada@firesio.app")).toBe("a***@firesio.app");
    expect(maskAddress("x@y.co")).toBe("x***@y.co");
  });

  it("hides anything that is not an address", () => {
    expect(maskAddress("not-an-address")).toBe("***");
    expect(maskAddress("@firesio.app")).toBe("***");
    expect(maskAddress("")).toBe("***");
  });
});

describe("readUnsubscribeLink", () => {
  it("reads the address a link was signed for and offers only a masked one to show", async () => {
    const token = await signUnsubscribeToken({ secret: SECRET, address: "Owner@Firesio.app" });
    expect(await readUnsubscribeLink(token, SECRET)).toEqual({ kind: "valid", address: "owner@firesio.app", masked: "o***@firesio.app" });
  });

  it("refuses anything we did not sign: a guess, another secret, a changed address, an empty link", async () => {
    const token = await signUnsubscribeToken({ secret: SECRET, address: "owner@firesio.app" });
    const [encoded, signature] = token.split(".");
    const forged = `${btoa("victim@firesio.app").replace(/=+$/, "")}.${signature}`;
    for (const candidate of ["", "nonsense", `${encoded}.`, forged, token.slice(0, -2)]) {
      expect(await readUnsubscribeLink(candidate, SECRET), candidate).toEqual({ kind: "invalid" });
    }
    expect(await readUnsubscribeLink(token, "another-secret")).toEqual({ kind: "invalid" });
  });
});

describe("confirmUnsubscribe", () => {
  it("records the address, and the shop it belongs to is no longer written to", async () => {
    await inRequest(async () => {
      await db.insert(shops).values([
        { shop: "alpha.myshopify.com", name: "Alpha", email: "Owner@Firesio.app", installedAt: 1 },
        { shop: "beta.myshopify.com", name: "Beta", email: "beta@firesio.app", installedAt: 1 },
      ]);
      expect((await previewAudience(DEFAULT_AUDIENCE)).recipients).toBe(2);

      const token = await signUnsubscribeToken({ secret: SECRET, address: "owner@firesio.app" });
      const result = await confirmUnsubscribe({ token, secret: SECRET, now: 7 }, { unsubscribes: new CampaignUnsubscribeRepo() });
      expect(result.kind).toBe("valid");

      expect(await db.select().from(campaignUnsubscribes).all()).toEqual([{ address: "owner@firesio.app", unsubscribedAt: 7, source: "link" }]);
      const after = await previewAudience(DEFAULT_AUDIENCE);
      expect(after).toMatchObject({ recipients: 1, unsubscribed: 1 });
      expect(after.sample.map((row) => row.shop)).toEqual(["beta.myshopify.com"]);
    });
  });

  it("is the same when asked twice, and the first request stays the one on record", async () => {
    await inRequest(async () => {
      const token = await signUnsubscribeToken({ secret: SECRET, address: "owner@firesio.app" });
      const dependencies = { unsubscribes: new CampaignUnsubscribeRepo() };
      await confirmUnsubscribe({ token, secret: SECRET, now: 1 }, dependencies);
      await confirmUnsubscribe({ token, secret: SECRET, now: 2 }, dependencies);
      expect(await db.select().from(campaignUnsubscribes).all()).toEqual([{ address: "owner@firesio.app", unsubscribedAt: 1, source: "link" }]);
    });
  });

  it("writes nothing for a link we did not sign", async () => {
    await inRequest(async () => {
      const result = await confirmUnsubscribe({ token: "forged.token", secret: SECRET, now: 1 }, { unsubscribes: new CampaignUnsubscribeRepo() });
      expect(result).toEqual({ kind: "invalid" });
      expect(await db.select().from(campaignUnsubscribes).all()).toEqual([]);
    });
  });
});
