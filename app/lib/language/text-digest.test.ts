import { describe, expect, it } from "vitest";
import { isOutdated, sourceDigest } from "./text-digest";

describe("sourceDigest", () => {
  it("is the SHA-256 hex of the UTF-8 text", async () => {
    expect(await sourceDigest("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(await sourceDigest("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("isOutdated", () => {
  it("is a text written against an older source", () => {
    expect(isOutdated("a", "b")).toBe(true);
    expect(isOutdated("a", "a")).toBe(false);
  });
});
