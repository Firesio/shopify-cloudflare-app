import { describe, expect, it } from "vitest";
import { hashToken } from "~/lib/token";
import { hashEndpoint, sameApplicationServerKey, urlBase64ToUint8Array } from "./encoding";

describe("urlBase64ToUint8Array", () => {
  it("decodes the unpadded base64url form a VAPID public key is published in", () => {
    // 65 bytes (an uncompressed P-256 point) = 87 base64url characters, no padding.
    const bytes = new Uint8Array(65).map((_, index) => (index * 7 + 4) % 256);
    const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(encoded).toHaveLength(87);
    expect(urlBase64ToUint8Array(encoded)).toEqual(bytes);
  });

  it("decodes the URL-safe characters - and _", () => {
    expect(urlBase64ToUint8Array("-_-_")).toEqual(new Uint8Array([0xfb, 0xff, 0xbf]));
  });

  it.each(["ab+c", "ab/c", "not base64!", "a"])("refuses %j rather than subscribing against garbage", (key) => {
    expect(urlBase64ToUint8Array(key)).toBeNull();
  });

  it("decodes an empty key to no bytes, which the subscribe step treats as invalid", () => {
    expect(urlBase64ToUint8Array("")?.length).toBe(0);
  });
});

describe("hashEndpoint", () => {
  it("is the lower-case hex SHA-256 of the endpoint", async () => {
    expect(await hashEndpoint("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("equals the digest the server computes with its own token hash (same bytes, same encoding)", async () => {
    const endpoint = "https://push.fake-service.invalid/send/ünïcode-and-long-" + "x".repeat(300);
    expect(await hashEndpoint(endpoint)).toBe(await hashToken(endpoint));
  });

  it("differs for different endpoints", async () => {
    expect(await hashEndpoint("https://a.invalid/1")).not.toBe(await hashEndpoint("https://a.invalid/2"));
  });
});

describe("sameApplicationServerKey", () => {
  const key = new Uint8Array([1, 2, 3, 4]);
  const buffer = (bytes: number[]) => new Uint8Array(bytes).buffer;

  it("matches byte for byte", () => {
    expect(sameApplicationServerKey(buffer([1, 2, 3, 4]), key)).toBe(true);
  });
  it("rejects a different key, a different length, and a subscription with no key", () => {
    expect(sameApplicationServerKey(buffer([1, 2, 3, 5]), key)).toBe(false);
    expect(sameApplicationServerKey(buffer([1, 2, 3]), key)).toBe(false);
    expect(sameApplicationServerKey(null, key)).toBe(false);
  });
});
