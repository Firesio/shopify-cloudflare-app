import { describe, expect, it } from "vitest";
import { decodeBase32, encodeBase32, hotp, otpauthUri, totpStep, verifyTotp } from "./totp";

const RFC_SECRET = new TextEncoder().encode("12345678901234567890");

describe("hotp — RFC 4226 Appendix D", () => {
  it("matches every published 6-digit value for counters 0..9", async () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    const actual = await Promise.all(expected.map((_, counter) => hotp(RFC_SECRET, counter)));
    expect(actual).toEqual(expected);
  });
});

describe("totp — RFC 6238 Appendix B (SHA-1, 8 digits)", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("at T=%i is %s", async (seconds, code) => {
    expect(await hotp(RFC_SECRET, totpStep(seconds * 1000), 8)).toBe(code);
  });
});

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    for (const length of [0, 1, 5, 10, 20, 33]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) % 256);
      expect(decodeBase32(encodeBase32(bytes))).toEqual(bytes);
    }
  });

  it("encodes the RFC 4648 test vector", () => {
    expect(encodeBase32(new TextEncoder().encode("foobar"))).toBe("MZXW6YTBOI");
  });

  it("accepts lower case, spaces and padding, and rejects foreign characters", () => {
    expect(decodeBase32("mzxw 6ytb oi==")).toEqual(new TextEncoder().encode("foobar"));
    expect(decodeBase32("MZXW1")).toBeNull();
  });
});

describe("verifyTotp", () => {
  const now = 1_800_000_015_000;
  const codeAt = (step: number) => hotp(RFC_SECRET, step);
  const step = totpStep(now);

  it("accepts the current code and reports its step", async () => {
    expect(await verifyTotp(RFC_SECRET, await codeAt(step), now, null)).toEqual({ ok: true, step });
  });

  it("accepts one step of drift either way, and not two", async () => {
    expect(await verifyTotp(RFC_SECRET, await codeAt(step - 1), now, null)).toEqual({ ok: true, step: step - 1 });
    expect(await verifyTotp(RFC_SECRET, await codeAt(step + 1), now, null)).toEqual({ ok: true, step: step + 1 });
    expect(await verifyTotp(RFC_SECRET, await codeAt(step - 2), now, null)).toEqual({ ok: false });
    expect(await verifyTotp(RFC_SECRET, await codeAt(step + 2), now, null)).toEqual({ ok: false });
  });

  it("refuses a code from a step already used, or older (a replayed code)", async () => {
    expect(await verifyTotp(RFC_SECRET, await codeAt(step), now, step)).toEqual({ ok: false });
    expect(await verifyTotp(RFC_SECRET, await codeAt(step - 1), now, step - 1)).toEqual({ ok: false });
    expect(await verifyTotp(RFC_SECRET, await codeAt(step + 1), now, step)).toEqual({ ok: true, step: step + 1 });
  });

  it("tolerates spaces in what was typed, and refuses anything that is not six digits", async () => {
    const code = await codeAt(step);
    expect(await verifyTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now, null)).toEqual({ ok: true, step });
    expect(await verifyTotp(RFC_SECRET, "", now, null)).toEqual({ ok: false });
    expect(await verifyTotp(RFC_SECRET, "12345", now, null)).toEqual({ ok: false });
    expect(await verifyTotp(RFC_SECRET, "abcdef", now, null)).toEqual({ ok: false });
  });

  it("refuses a wrong code", async () => {
    const code = await codeAt(step);
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    expect(await verifyTotp(RFC_SECRET, wrong, now, null)).toEqual({ ok: false });
  });
});

describe("otpauthUri", () => {
  it("builds the Key Uri Format with the issuer in the label and as a parameter", () => {
    const uri = new URL(otpauthUri({ issuer: "Useful App", account: "sam@team.dev", secret: "JBSWY3DPEHPK3PXP" }));
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.host).toBe("totp");
    expect(decodeURIComponent(uri.pathname)).toBe("/Useful App:sam@team.dev");
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret: "JBSWY3DPEHPK3PXP", issuer: "Useful App", algorithm: "SHA1", digits: "6", period: "30",
    });
  });
});
