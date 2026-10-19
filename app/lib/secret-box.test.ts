import { describe, expect, it } from "vitest";
import { deriveSecretBoxKey, open, seal, SECRET_BOX_IV_BYTES } from "./secret-box";

const iv = (fill: number) => new Uint8Array(SECRET_BOX_IV_BYTES).fill(fill);

describe("secret-box", () => {
  it("round-trips a secret", async () => {
    const key = await deriveSecretBoxKey("configured-secret", "staff-totp");
    const sealed = await seal(key, "JBSWY3DPEHPK3PXP", iv(1));
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(await open(key, sealed)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("cannot be opened with another configured secret or another purpose", async () => {
    const key = await deriveSecretBoxKey("configured-secret", "staff-totp");
    const sealed = await seal(key, "secret", iv(2));
    expect(await open(await deriveSecretBoxKey("other-secret", "staff-totp"), sealed)).toBeNull();
    expect(await open(await deriveSecretBoxKey("configured-secret", "other-purpose"), sealed)).toBeNull();
  });

  it("detects tampering and malformed values", async () => {
    const key = await deriveSecretBoxKey("configured-secret", "staff-totp");
    const sealed = await seal(key, "secret", iv(3));
    const flipped = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(await open(key, flipped)).toBeNull();
    for (const bad of ["", "v1", "v2.AAAA.AAAA", "v1.AAAA.AAAA", "v1.!!.AAAA", `${sealed}.extra`]) {
      expect(await open(key, bad)).toBeNull();
    }
  });

  it("refuses an IV of the wrong length rather than encrypting weakly", async () => {
    const key = await deriveSecretBoxKey("configured-secret", "staff-totp");
    await expect(seal(key, "secret", new Uint8Array(8))).rejects.toThrow(/IV must be 12 bytes/);
  });
});
