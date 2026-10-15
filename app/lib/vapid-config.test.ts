import { describe, expect, it } from "vitest";
import { encodeBase64Url } from "~/lib/base64url";
import { vapidConfig } from "./vapid-config";

const publicKey = encodeBase64Url(Uint8Array.of(4, ...Array.from({ length: 64 }, (_, i) => i + 1)));
const privateKey = encodeBase64Url(Uint8Array.from({ length: 32 }, (_, i) => i + 1));
const subject = "https://app.example-shop.dev";

describe("vapidConfig", () => {
  it("returns the configuration when everything is well-formed", () => {
    expect(vapidConfig(publicKey, privateKey, subject)).toEqual({ publicKey, privateKey, subject });
    expect(vapidConfig(publicKey, privateKey, "mailto:ops@example-shop.dev")?.subject).toBe("mailto:ops@example-shop.dev");
  });

  it("is null when either key is absent or empty (push not configured)", () => {
    expect(vapidConfig("", privateKey, subject)).toBeNull();
    expect(vapidConfig(publicKey, "", subject)).toBeNull();
    expect(vapidConfig(publicKey, undefined, subject)).toBeNull();
    expect(vapidConfig(publicKey, null, subject)).toBeNull();
  });

  it("is null when the private key is not a string", () => {
    for (const value of [42, {}, [], true, Symbol("x"), new Uint8Array(32)]) {
      expect(vapidConfig(publicKey, value, subject)).toBeNull();
    }
  });

  it("is null for a public key that is not a 65-byte uncompressed point", () => {
    expect(vapidConfig(encodeBase64Url(new Uint8Array(64)), privateKey, subject)).toBeNull();
    expect(vapidConfig(encodeBase64Url(new Uint8Array(66)), privateKey, subject)).toBeNull();
    expect(vapidConfig(encodeBase64Url(Uint8Array.of(2, ...new Uint8Array(64))), privateKey, subject)).toBeNull();
  });

  it("is null for a private key that is not 32 bytes", () => {
    expect(vapidConfig(publicKey, encodeBase64Url(new Uint8Array(31)), subject)).toBeNull();
    expect(vapidConfig(publicKey, encodeBase64Url(new Uint8Array(33)), subject)).toBeNull();
  });

  it("is null for keys that are not base64url", () => {
    expect(vapidConfig("+/+/ not base64url", privateKey, subject)).toBeNull();
    expect(vapidConfig(publicKey, "***", subject)).toBeNull();
  });

  it("is null for a subject that is neither mailto: nor https:", () => {
    for (const bad of ["", "http://localhost:3000", "ops@example-shop.dev", "mailto:"]) {
      expect(vapidConfig(publicKey, privateKey, bad)).toBeNull();
    }
  });

  it("never throws, whatever it is given", () => {
    const hostile: readonly unknown[] = [undefined, null, 1, {}, "\u0000", "=".repeat(10_000), "A".repeat(100_000)];
    for (const value of hostile) {
      expect(() => vapidConfig(String(value), value, String(value))).not.toThrow();
    }
  });
});
