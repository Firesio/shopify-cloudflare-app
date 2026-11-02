import { describe, expect, it } from "vitest";
import { hmacBase64Url } from "./hmac";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";

const SECRET = "test-secret";

describe("unsubscribe tokens", () => {
  it("round-trips an address", async () => {
    const token = await signUnsubscribeToken({ secret: SECRET, address: "person@firesio.app" });
    expect(await verifyUnsubscribeToken({ secret: SECRET, token })).toBe("person@firesio.app");
  });

  it("gives one address one token whatever its case or padding", async () => {
    const a = await signUnsubscribeToken({ secret: SECRET, address: "Person@Firesio.app" });
    const b = await signUnsubscribeToken({ secret: SECRET, address: "  person@firesio.app " });
    expect(a).toBe(b);
  });

  it("is safe in a URL path", async () => {
    const token = await signUnsubscribeToken({ secret: SECRET, address: "a+b@firesio.app" });
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signUnsubscribeToken({ secret: "other", address: "person@firesio.app" });
    expect(await verifyUnsubscribeToken({ secret: SECRET, token })).toBeUndefined();
  });

  it("rejects a token whose address was swapped for another one", async () => {
    const mine = await signUnsubscribeToken({ secret: SECRET, address: "me@firesio.app" });
    const theirs = await signUnsubscribeToken({ secret: SECRET, address: "victim@firesio.app" });
    const forged = `${theirs.split(".")[0]}.${mine.split(".")[1]}`;
    expect(await verifyUnsubscribeToken({ secret: SECRET, token: forged })).toBeUndefined();
  });

  it("rejects a signature made for a different purpose over the same text", async () => {
    const encoded = (await signUnsubscribeToken({ secret: SECRET, address: "person@firesio.app" })).split(".")[0];
    const wrongPurpose = await hmacBase64Url(SECRET, "person@firesio.app");
    expect(await verifyUnsubscribeToken({ secret: SECRET, token: `${encoded}.${wrongPurpose}` })).toBeUndefined();
  });

  it.each(["", ".", "abc", "abc.", ".abc", "!!!.abc", "cGVyc29u.", "a.b.c"])("rejects the malformed token %j", async (token) => {
    expect(await verifyUnsubscribeToken({ secret: SECRET, token })).toBeUndefined();
  });

  it("rejects an address that is not in the normalized form, even with a signature over it", async () => {
    const raw = "Person@Firesio.app";
    const encoded = btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const signature = await hmacBase64Url(SECRET, `campaign-unsubscribe:v1:${raw}`);
    expect(await verifyUnsubscribeToken({ secret: SECRET, token: `${encoded}.${signature}` })).toBeUndefined();
  });
});
