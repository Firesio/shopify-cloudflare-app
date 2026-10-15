import { describe, expect, it } from "vitest";
import { decodeBase64Url, encodeBase64Url } from "~/lib/base64url";
import { decryptPush } from "~/test/web-push-decrypt";
import {
  ENCRYPTED_HEADER_BYTES,
  encryptPayload,
  MAX_PLAINTEXT_BYTES,
  MAX_PUSH_BODY_BYTES,
  type EncryptPayloadInput,
} from "./encrypt";
import { exportP256PrivateScalar, generateP256KeyPair, importP256PrivateKey } from "./keys";

// RFC 8291 section 5 and Appendix A — the worked example, byte for byte.
const RFC = {
  plaintext: decode("V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24"),
  authSecret: decode("BTBZMqHH6r4Tts7J_aSIgg"),
  salt: decode("DGv6ra1nlYgDCS1FRnbzlw"),
  uaPublic: decode("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
  uaPrivate: decode("q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94"),
  asPublic: decode("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"),
  asPrivate: decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"),
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

function decode(text: string): Uint8Array<ArrayBuffer> {
  const bytes = decodeBase64Url(text);
  if (bytes === null) throw new Error(`bad fixture ${text}`);
  return bytes;
}

async function rfcInput(overrides: Partial<EncryptPayloadInput> = {}): Promise<EncryptPayloadInput> {
  return {
    plaintext: RFC.plaintext,
    userAgentPublicKey: RFC.uaPublic,
    authSecret: RFC.authSecret,
    salt: RFC.salt,
    senderKeys: {
      publicKey: RFC.asPublic,
      privateKey: await importP256PrivateKey(RFC.asPublic, RFC.asPrivate, "ECDH"),
    },
    ...overrides,
  };
}

async function encrypted(overrides: Partial<EncryptPayloadInput> = {}): Promise<Uint8Array<ArrayBuffer>> {
  const result = await encryptPayload(await rfcInput(overrides));
  if (!result.ok) throw new Error(`encryption failed: ${result.reason}`);
  return result.value;
}

describe("encryptPayload — RFC 8291 Appendix A", () => {
  it("produces exactly the body the RFC shows", async () => {
    const body = await encrypted();
    expect(encodeBase64Url(body)).toBe(RFC.body);
    // 86 header + 41 plaintext + 1 delimiter + 16 tag. (The RFC's illustrative "Content-Length: 145" is off by one;
    // the base64url body it prints decodes to 144 bytes.)
    expect(body).toHaveLength(144);
  });

  it("starts with the 86-byte coding header: salt, rs=4096, idlen=65, sender key", async () => {
    const body = await encrypted();
    expect(ENCRYPTED_HEADER_BYTES).toBe(86);
    expect(body.slice(0, 16)).toEqual(RFC.salt);
    expect([...body.slice(16, 20)]).toEqual([0, 0, 0x10, 0]);
    expect(body[20]).toBe(65);
    expect(body.slice(21, 86)).toEqual(RFC.asPublic);
  });

  it("is deterministic for the same inputs", async () => {
    expect(await encrypted()).toEqual(await encrypted());
  });

  it("decrypts back to the plaintext with the user agent's private key", async () => {
    const decrypted = await decryptPush({
      body: decode(RFC.body),
      userAgentPrivateKey: RFC.uaPrivate,
      userAgentPublicKey: RFC.uaPublic,
      authSecret: RFC.authSecret,
    });
    expect(new TextDecoder().decode(decrypted.plaintext)).toBe("When I grow up, I want to be a watermelon");
  });
});

describe("encryptPayload — round trip with fresh keys", () => {
  async function roundTrip(plaintext: Uint8Array): Promise<Uint8Array> {
    const userAgent = await generateP256KeyPair("ECDH", true);
    const uaScalar = await exportP256PrivateScalar(userAgent.privateKey);
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const result = await encryptPayload({
      plaintext,
      userAgentPublicKey: userAgent.publicKey,
      authSecret,
      salt: crypto.getRandomValues(new Uint8Array(16)),
      senderKeys: await generateP256KeyPair("ECDH", false),
    });
    if (!result.ok) throw new Error(result.reason);
    const decrypted = await decryptPush({
      body: result.value,
      userAgentPrivateKey: uaScalar,
      userAgentPublicKey: userAgent.publicKey,
      authSecret,
    });
    return decrypted.plaintext;
  }

  it.each([0, 1, 15, 16, 17, 255, 1000, MAX_PLAINTEXT_BYTES])("round-trips %i bytes", async (length) => {
    const plaintext = Uint8Array.from({ length }, (_, i) => (i * 7 + 1) % 256);
    expect(await roundTrip(plaintext)).toEqual(plaintext);
  });

  it("round-trips multi-byte UTF-8 and trailing zero bytes (the padding scan stops at the delimiter)", async () => {
    const text = new TextEncoder().encode('{"title":"Đơn hàng mới ✓","body":"x"}');
    expect(await roundTrip(text)).toEqual(text);
    const zeros = new Uint8Array([1, 0, 0, 0]);
    expect(await roundTrip(zeros)).toEqual(zeros);
  });
});

describe("encryptPayload — size", () => {
  it("accepts the largest plaintext and yields a body of exactly 4096 bytes", async () => {
    expect(MAX_PLAINTEXT_BYTES).toBe(3993);
    const body = await encrypted({ plaintext: new Uint8Array(MAX_PLAINTEXT_BYTES) });
    expect(body).toHaveLength(MAX_PUSH_BODY_BYTES);
  });

  it("refuses one byte more", async () => {
    const result = await encryptPayload(await rfcInput({ plaintext: new Uint8Array(MAX_PLAINTEXT_BYTES + 1) }));
    expect(result).toEqual({ ok: false, reason: "payload_too_large" });
  });
});

describe("encryptPayload — invalid input", () => {
  it("refuses a user agent key of the wrong length or prefix", async () => {
    for (const key of [RFC.uaPublic.slice(0, 64), new Uint8Array(65), Uint8Array.of(...RFC.uaPublic.slice(0, 64), 0, 0)]) {
      expect(await encryptPayload(await rfcInput({ userAgentPublicKey: key }))).toEqual({
        ok: false,
        reason: "invalid_user_agent_key",
      });
    }
  });

  it("refuses a point that is not on the curve", async () => {
    const offCurve = Uint8Array.from(RFC.uaPublic);
    offCurve[64] = (offCurve[64] ?? 0) ^ 0x01;
    expect(await encryptPayload(await rfcInput({ userAgentPublicKey: offCurve }))).toEqual({
      ok: false,
      reason: "invalid_user_agent_key",
    });
  });

  it("refuses an auth secret that is not 16 bytes", async () => {
    for (const length of [0, 15, 17]) {
      expect(await encryptPayload(await rfcInput({ authSecret: new Uint8Array(length) }))).toEqual({
        ok: false,
        reason: "invalid_auth_secret",
      });
    }
  });

  it("refuses a salt that is not 16 bytes", async () => {
    expect(await encryptPayload(await rfcInput({ salt: new Uint8Array(15) }))).toEqual({
      ok: false,
      reason: "invalid_salt",
    });
  });

  it("refuses a malformed sender public key", async () => {
    const base = await rfcInput();
    expect(
      await encryptPayload({ ...base, senderKeys: { ...base.senderKeys, publicKey: new Uint8Array(33) } }),
    ).toEqual({ ok: false, reason: "invalid_sender_key" });
  });
});

describe("encryptPayload — tampering is detected by the receiver", () => {
  const receive = (body: Uint8Array, authSecret: Uint8Array = RFC.authSecret) =>
    decryptPush({ body, userAgentPrivateKey: RFC.uaPrivate, userAgentPublicKey: RFC.uaPublic, authSecret });

  it("accepts the untouched body (control)", async () => {
    await expect(receive(await encrypted())).resolves.toBeDefined();
  });

  it("rejects a flipped ciphertext bit", async () => {
    const body = await encrypted();
    body[100] = (body[100] ?? 0) ^ 0x01;
    await expect(receive(body)).rejects.toThrow();
  });

  it("rejects a flipped authentication-tag bit", async () => {
    const body = await encrypted();
    body[body.length - 1] = (body[body.length - 1] ?? 0) ^ 0x80;
    await expect(receive(body)).rejects.toThrow();
  });

  it("rejects a changed salt", async () => {
    const body = await encrypted();
    body[0] = (body[0] ?? 0) ^ 0x01;
    await expect(receive(body)).rejects.toThrow();
  });

  it("rejects a truncated body", async () => {
    const body = await encrypted();
    await expect(receive(body.slice(0, body.length - 1))).rejects.toThrow();
  });

  it("rejects the wrong auth secret", async () => {
    await expect(receive(await encrypted(), new Uint8Array(16))).rejects.toThrow();
  });
});
