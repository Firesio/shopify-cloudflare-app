import { describe, expect, it } from "vitest";
import { decodeBase64Url, encodeBase64Url } from "./base64url";

describe("encodeBase64Url", () => {
  it("encodes with the URL-safe alphabet and no padding", () => {
    expect(encodeBase64Url(new Uint8Array([0xfb, 0xff, 0xfe]))).toBe("-__-");
    expect(encodeBase64Url(new Uint8Array([1]))).toBe("AQ");
    expect(encodeBase64Url(new Uint8Array([1, 2]))).toBe("AQI");
    expect(encodeBase64Url(new Uint8Array([]))).toBe("");
  });
});

describe("decodeBase64Url", () => {
  it("round-trips every length from 0 to 70", () => {
    for (let length = 0; length <= 70; length += 1) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + length) % 256);
      expect(decodeBase64Url(encodeBase64Url(bytes))).toEqual(bytes);
    }
  });

  it("round-trips all 256 byte values", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(decodeBase64Url(encodeBase64Url(bytes))).toEqual(bytes);
  });

  it("tolerates trailing padding", () => {
    expect(decodeBase64Url("AQ==")).toEqual(new Uint8Array([1]));
    expect(decodeBase64Url("AQI=")).toEqual(new Uint8Array([1, 2]));
  });

  it("rejects the standard alphabet, whitespace and other characters", () => {
    for (const bad of ["+/+/", "a b c", "AQ\n", "AQ$", "é", "AQ=A", "="]) {
      expect(decodeBase64Url(bad)).toBeNull();
    }
  });

  it("rejects a length that no byte string encodes to", () => {
    expect(decodeBase64Url("A")).toBeNull();
    expect(decodeBase64Url("AAAAA")).toBeNull();
  });
});
