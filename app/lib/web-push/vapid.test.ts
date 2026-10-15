import { describe, expect, it } from "vitest";
import { decodeBase64Url, encodeBase64Url } from "~/lib/base64url";
import { generateP256KeyPair } from "./keys";
import {
  generateVapidKeys,
  importVapidKeys,
  isVapidSubject,
  VAPID_TOKEN_LIFETIME_SECONDS,
  vapidAudience,
  vapidAuthorization,
  type VapidSigningKey,
} from "./vapid";

const NOW = 1_800_000_000;
const SUBJECT = "https://app.example-shop.dev";
const ENDPOINT = "https://push.example.net/p/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV?x=1";

async function signingKey(): Promise<VapidSigningKey> {
  const result = await importVapidKeys(await generateVapidKeys());
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

interface Parsed {
  readonly jwt: string;
  readonly key: string;
  readonly header: Record<string, unknown>;
  readonly claims: Record<string, unknown>;
}

function parse(authorization: string): Parsed {
  const match = /^vapid t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(authorization);
  if (match === null) throw new Error(`malformed header: ${authorization}`);
  const [, jwt = "", key = ""] = match;
  const [header = "", claims = ""] = jwt.split(".");
  const json = (part: string): Record<string, unknown> => JSON.parse(new TextDecoder().decode(decodeBase64Url(part) ?? undefined));
  return { jwt, key, header: json(header), claims: json(claims) };
}

async function verifies(jwt: string, publicKey: string): Promise<boolean> {
  const [header, claims, signature] = jwt.split(".");
  const raw = decodeBase64Url(publicKey);
  const sig = decodeBase64Url(signature ?? "");
  if (raw === null || sig === null) return false;
  const key = await crypto.subtle.importKey("raw", raw, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, new TextEncoder().encode(`${header}.${claims}`));
}

async function authorization(overrides: Partial<Parameters<typeof vapidAuthorization>[0]> = {}): Promise<string> {
  const result = await vapidAuthorization({
    key: await signingKey(),
    endpoint: ENDPOINT,
    subject: SUBJECT,
    nowSeconds: NOW,
    ...overrides,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe("generateVapidKeys", () => {
  it("returns a 65-byte uncompressed public key and a 32-byte scalar, base64url", async () => {
    const keys = await generateVapidKeys();
    expect(decodeBase64Url(keys.publicKey)).toHaveLength(65);
    expect(decodeBase64Url(keys.publicKey)?.[0]).toBe(4);
    expect(decodeBase64Url(keys.privateKey)).toHaveLength(32);
    expect(keys.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats", async () => {
    expect((await generateVapidKeys()).privateKey).not.toBe((await generateVapidKeys()).privateKey);
  });
});

describe("importVapidKeys", () => {
  it("imports a generated pair", async () => {
    expect((await importVapidKeys(await generateVapidKeys())).ok).toBe(true);
  });

  it("refuses malformed keys", async () => {
    const good = await generateVapidKeys();
    const pair = await generateP256KeyPair("ECDSA", false);
    const cases = [
      { ...good, publicKey: "" },
      { ...good, privateKey: "" },
      { ...good, publicKey: "not base64url!" },
      { ...good, privateKey: encodeBase64Url(new Uint8Array(31)) },
      { ...good, publicKey: encodeBase64Url(pair.publicKey.slice(0, 64)) },
      { ...good, publicKey: encodeBase64Url(Uint8Array.of(2, ...pair.publicKey.slice(1))) },
    ];
    for (const keys of cases) expect(await importVapidKeys(keys)).toEqual({ ok: false, reason: "invalid_vapid_key" });
  });
});

describe("vapidAudience", () => {
  it("is the origin only: no path, query or fragment", () => {
    expect(vapidAudience("https://push.example.net/p/abc?x=1#f")).toBe("https://push.example.net");
    expect(vapidAudience("https://fcm.googleapis.com/fcm/send/abc")).toBe("https://fcm.googleapis.com");
  });

  it("keeps a non-default port and drops the default one", () => {
    expect(vapidAudience("https://push.example.net:8443/p")).toBe("https://push.example.net:8443");
    expect(vapidAudience("https://push.example.net:443/p")).toBe("https://push.example.net");
  });

  it("drops userinfo, which must never reach a token", () => {
    expect(vapidAudience("https://user:pass@push.example.net/p")).toBe("https://push.example.net");
  });

  it("refuses non-https and unparseable endpoints", () => {
    expect(vapidAudience("http://push.example.net/p")).toBeNull();
    expect(vapidAudience("not a url")).toBeNull();
    expect(vapidAudience("")).toBeNull();
  });
});

describe("isVapidSubject", () => {
  it("accepts mailto: and https: URIs only", () => {
    expect(isVapidSubject("mailto:ops@example-shop.dev")).toBe(true);
    expect(isVapidSubject("https://app.example-shop.dev")).toBe(true);
    for (const bad of ["", "mailto:", "http://app.example-shop.dev", "ops@example-shop.dev", "https://", "javascript:alert(1)"]) {
      expect(isVapidSubject(bad)).toBe(false);
    }
  });
});

describe("vapidAuthorization", () => {
  it("has the RFC 8292 shape: scheme vapid, t=<jwt>, k=<public key>", async () => {
    const key = await signingKey();
    const header = await authorization({ key });
    const parsed = parse(header);
    expect(parsed.key).toBe(key.publicKey);
    expect(parsed.header).toEqual({ typ: "JWT", alg: "ES256" });
  });

  it("carries aud (origin only), exp (now + 12h) and sub", async () => {
    const parsed = parse(await authorization());
    expect(parsed.claims).toEqual({
      aud: "https://push.example.net",
      exp: NOW + VAPID_TOKEN_LIFETIME_SECONDS,
      sub: SUBJECT,
    });
  });

  it("keeps exp in the future and no more than 24 hours ahead", async () => {
    const parsed = parse(await authorization());
    const exp = Number(parsed.claims.exp);
    expect(exp).toBeGreaterThan(NOW);
    expect(exp - NOW).toBeLessThanOrEqual(24 * 60 * 60);
    expect(Number.isInteger(exp)).toBe(true);
  });

  it("floors a fractional clock reading", async () => {
    expect(parse(await authorization({ nowSeconds: NOW + 0.9 })).claims.exp).toBe(NOW + VAPID_TOKEN_LIFETIME_SECONDS);
  });

  it("signs with a 64-byte r||s signature that verifies under the public key", async () => {
    const key = await signingKey();
    const parsed = parse(await authorization({ key }));
    expect(decodeBase64Url(parsed.jwt.split(".")[2] ?? "")).toHaveLength(64);
    expect(await verifies(parsed.jwt, key.publicKey)).toBe(true);
  });

  it("does not verify under another key", async () => {
    const parsed = parse(await authorization());
    expect(await verifies(parsed.jwt, (await generateVapidKeys()).publicKey)).toBe(false);
  });

  it("does not verify once a claim is altered", async () => {
    const key = await signingKey();
    const parsed = parse(await authorization({ key }));
    const [header, , signature] = parsed.jwt.split(".");
    const forged = encodeBase64Url(
      new TextEncoder().encode(JSON.stringify({ ...parsed.claims, exp: NOW + 10 * VAPID_TOKEN_LIFETIME_SECONDS })),
    );
    expect(await verifies(`${header}.${forged}.${signature}`, key.publicKey)).toBe(false);
  });

  it("refuses an endpoint it cannot take an audience from", async () => {
    const key = await signingKey();
    expect(await vapidAuthorization({ key, endpoint: "http://push.example.net/p", subject: SUBJECT, nowSeconds: NOW })).toEqual({
      ok: false,
      reason: "invalid_endpoint",
    });
  });

  it("refuses a subject that is not a mailto: or https: URI", async () => {
    const key = await signingKey();
    expect(await vapidAuthorization({ key, endpoint: ENDPOINT, subject: "ops", nowSeconds: NOW })).toEqual({
      ok: false,
      reason: "invalid_subject",
    });
  });
});
