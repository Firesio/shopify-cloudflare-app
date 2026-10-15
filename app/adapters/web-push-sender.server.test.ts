import { beforeAll, describe, expect, it } from "vitest";
import { decodeBase64Url, encodeBase64Url } from "~/lib/base64url";
import type { VapidConfig } from "~/lib/vapid-config";
import { generateP256KeyPair } from "~/lib/web-push/keys";
import { generateVapidKeys } from "~/lib/web-push/vapid";
import type { PushRequest } from "~/ports/push-sender";
import { sequentialRandomBytes } from "~/test/fake-runtime";
import { decryptPush } from "~/test/web-push-decrypt";
import { WebPushSender, type PushLogEntry, type WebPushSenderDeps } from "./web-push-sender.server";

// The user agent from RFC 8291 Appendix A stands in for a browser subscription.
const UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const UA_PRIVATE = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94";
const UA_AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
const ENDPOINT = "https://push.example.net/p/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV?secret=1";
const NOW_MS = 1_800_000_000_000;
const SUBJECT = "https://app.example-shop.dev";

function bytes(text: string): Uint8Array<ArrayBuffer> {
  const out = decodeBase64Url(text);
  if (out === null) throw new Error("bad fixture");
  return out;
}

interface Captured {
  readonly url: string;
  readonly init: RequestInit;
}

interface Harness {
  readonly sender: WebPushSender;
  readonly calls: Captured[];
  readonly logs: PushLogEntry[];
  readonly vapid: VapidConfig;
}

let vapid: VapidConfig;

beforeAll(async () => {
  vapid = { ...(await generateVapidKeys()), subject: SUBJECT };
});

function harness(respond: (call: Captured) => Response | Promise<Response>, overrides: Partial<WebPushSenderDeps> = {}): Harness {
  const calls: Captured[] = [];
  const logs: PushLogEntry[] = [];
  const fake: typeof fetch = async (input, init) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return respond(call);
  };
  const sender = new WebPushSender({
    vapid,
    fetch: fake,
    now: () => NOW_MS,
    randomBytes: sequentialRandomBytes(),
    log: (entry) => logs.push(entry),
    ...overrides,
  });
  return { sender, calls, logs, vapid };
}

function request(overrides: Partial<PushRequest> = {}): PushRequest {
  return {
    target: { endpoint: ENDPOINT, p256dh: UA_PUBLIC, auth: UA_AUTH },
    payload: JSON.stringify({ title: "New ticket", body: "Order #1001 needs a reply" }),
    ttlSeconds: 3600,
    urgency: "normal",
    ...overrides,
  };
}

const status = (code: number, headers: HeadersInit = {}) => () => new Response(null, { status: code, headers });

function header(call: Captured, name: string): string | undefined {
  return new Headers(call.init.headers).get(name) ?? undefined;
}

function bodyOf(call: Captured): Uint8Array {
  if (!(call.init.body instanceof Uint8Array)) throw new Error("body is not bytes");
  return call.init.body;
}

describe("WebPushSender — the request", () => {
  it("POSTs the encrypted body to the endpoint with the Web Push headers", async () => {
    const h = harness(status(201));
    expect(await h.sender.send(request({ urgency: "high", ttlSeconds: 120 }))).toEqual({ kind: "sent" });

    const [call] = h.calls;
    if (call === undefined) throw new Error("no request was made");
    expect(h.calls).toHaveLength(1);
    expect(call.url).toBe(ENDPOINT);
    expect(call.init.method).toBe("POST");
    expect(call.init.redirect).toBe("manual");
    expect(header(call, "Content-Encoding")).toBe("aes128gcm");
    expect(header(call, "Content-Type")).toBe("application/octet-stream");
    expect(header(call, "TTL")).toBe("120");
    expect(header(call, "Urgency")).toBe("high");
    expect(header(call, "Topic")).toBeUndefined();
    expect(call.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("encrypts a body the subscription can decrypt back to the payload", async () => {
    const h = harness(status(201));
    const req = request();
    await h.sender.send(req);
    const [call] = h.calls;
    if (call === undefined) throw new Error("no request was made");
    const decrypted = await decryptPush({
      body: bodyOf(call),
      userAgentPrivateKey: bytes(UA_PRIVATE),
      userAgentPublicKey: bytes(UA_PUBLIC),
      authSecret: bytes(UA_AUTH),
    });
    expect(new TextDecoder().decode(decrypted.plaintext)).toBe(req.payload);
    expect(decrypted.recordSize).toBe(4096);
  });

  it("uses a fresh salt and a fresh sender key for every message", async () => {
    const h = harness(status(201));
    await h.sender.send(request());
    await h.sender.send(request());
    const [first, second] = h.calls.map(bodyOf);
    if (first === undefined || second === undefined) throw new Error("expected two requests");
    expect(first.slice(0, 16)).not.toEqual(second.slice(0, 16));
    expect(first.slice(21, 86)).not.toEqual(second.slice(21, 86));
  });

  it("takes the salt from randomBytes and the sender key from generateKeyPair", async () => {
    const sender = await generateP256KeyPair("ECDH", false);
    const h = harness(status(201), { randomBytes: (n) => new Uint8Array(n).fill(7), generateKeyPair: async () => sender });
    await h.sender.send(request());
    const [call] = h.calls;
    if (call === undefined) throw new Error("no request was made");
    expect(bodyOf(call).slice(0, 16)).toEqual(new Uint8Array(16).fill(7));
    expect(bodyOf(call).slice(21, 86)).toEqual(sender.publicKey);
  });

  it("signs a VAPID token whose audience is the endpoint origin and whose key is ours", async () => {
    const h = harness(status(201));
    await h.sender.send(request());
    const [call] = h.calls;
    if (call === undefined) throw new Error("no request was made");
    const match = /^vapid t=([^,]+), k=(\S+)$/.exec(header(call, "Authorization") ?? "");
    if (match === null) throw new Error("no vapid header");
    const [, jwt = "", key = ""] = match;
    expect(key).toBe(vapid.publicKey);
    const [headerPart = "", claimsPart = "", signaturePart = ""] = jwt.split(".");
    const claims = JSON.parse(new TextDecoder().decode(bytes(claimsPart)));
    expect(claims).toEqual({ aud: "https://push.example.net", exp: NOW_MS / 1000 + 12 * 3600, sub: SUBJECT });
    const publicKey = await crypto.subtle.importKey("raw", bytes(vapid.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const signed = new TextEncoder().encode(`${headerPart}.${claimsPart}`);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publicKey, bytes(signaturePart), signed)).toBe(true);
  });

  it("sends a valid topic as is", async () => {
    const h = harness(status(201));
    await h.sender.send(request({ topic: "ticket_42-a" }));
    expect(header(h.calls[0] ?? { url: "", init: {} }, "Topic")).toBe("ticket_42-a");
  });

  it("turns a topic that is too long or outside the alphabet into a stable 32-character digest", async () => {
    const h = harness(status(201));
    const long = "ticket:" + "x".repeat(60);
    await h.sender.send(request({ topic: long }));
    await h.sender.send(request({ topic: long }));
    await h.sender.send(request({ topic: "has space/é" }));
    const topics = h.calls.map((call) => header(call, "Topic"));
    expect(topics[0]).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(topics[1]).toBe(topics[0]);
    expect(topics[2]).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(topics[2]).not.toBe(topics[0]);
  });
});

describe("WebPushSender — classifying the answer", () => {
  it.each([200, 201, 202])("%i is sent", async (code) => {
    expect(await harness(status(code)).sender.send(request())).toEqual({ kind: "sent" });
  });

  it.each([404, 410])("%i is gone", async (code) => {
    expect(await harness(status(code)).sender.send(request())).toEqual({ kind: "gone" });
  });

  it("429 is retry, with the status, and ignores Retry-After", async () => {
    const result = await harness(status(429, { "Retry-After": "120" })).sender.send(request());
    expect(result).toEqual({ kind: "retry", reason: "http_429", status: 429 });
  });

  it.each([500, 502, 503, 599])("%i is retry, with the status", async (code) => {
    expect(await harness(status(code)).sender.send(request())).toEqual({ kind: "retry", reason: `http_${code}`, status: code });
  });

  it.each([400, 401, 403, 413, 204, 301, 418])("%i is rejected, with the status", async (code) => {
    expect(await harness(status(code)).sender.send(request())).toEqual({ kind: "rejected", reason: `http_${code}`, status: code });
  });

  it("a network error is retry", async () => {
    const h = harness(() => {
      throw new TypeError("fetch failed to https://push.example.net/p/JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV");
    });
    expect(await h.sender.send(request())).toEqual({ kind: "retry", reason: "network_error" });
  });

  it("a timeout is retry", async () => {
    const h = harness(() => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    expect(await h.sender.send(request())).toEqual({ kind: "retry", reason: "timeout" });
  });

  it("really times out a push service that never answers", async () => {
    const h = harness(
      (call) =>
        new Promise<Response>((_, reject) => {
          call.init.signal?.addEventListener("abort", () => reject(call.init.signal?.reason));
        }),
      { timeoutMs: 20 },
    );
    expect(await h.sender.send(request())).toEqual({ kind: "retry", reason: "timeout" });
  });
});

describe("WebPushSender — refuses before sending", () => {
  it("rejects a payload that encrypts to more than 4096 bytes, without a request", async () => {
    const h = harness(status(201));
    const result = await h.sender.send(request({ payload: "x".repeat(3994) }));
    expect(result).toEqual({ kind: "rejected", reason: "payload_too_large" });
    expect(h.calls).toHaveLength(0);
  });

  it("accepts the largest payload: the body is exactly 4096 bytes", async () => {
    const h = harness(status(201));
    expect(await h.sender.send(request({ payload: "x".repeat(3993) }))).toEqual({ kind: "sent" });
    expect(h.calls[0] ? bodyOf(h.calls[0]) : undefined).toHaveLength(4096);
  });

  it("counts bytes, not characters", async () => {
    const h = harness(status(201));
    const result = await h.sender.send(request({ payload: "é".repeat(2000) }));
    expect(result).toEqual({ kind: "rejected", reason: "payload_too_large" });
    expect(h.calls).toHaveLength(0);
  });

  it("rejects an endpoint that is not https", async () => {
    const h = harness(status(201));
    for (const endpoint of ["http://push.example.net/p", "not a url", ""]) {
      const result = await h.sender.send(request({ target: { endpoint, p256dh: UA_PUBLIC, auth: UA_AUTH } }));
      expect(result).toEqual({ kind: "rejected", reason: "invalid_endpoint" });
    }
    expect(h.calls).toHaveLength(0);
  });

  it("rejects malformed subscription keys", async () => {
    const h = harness(status(201));
    const bad = [
      { endpoint: ENDPOINT, p256dh: "***", auth: UA_AUTH },
      { endpoint: ENDPOINT, p256dh: UA_PUBLIC, auth: "***" },
      { endpoint: ENDPOINT, p256dh: encodeBase64Url(new Uint8Array(65)), auth: UA_AUTH },
      { endpoint: ENDPOINT, p256dh: UA_PUBLIC, auth: encodeBase64Url(new Uint8Array(8)) },
    ];
    for (const target of bad) {
      expect(await h.sender.send(request({ target }))).toEqual({ kind: "rejected", reason: "invalid_subscription_key" });
    }
    expect(h.calls).toHaveLength(0);
  });

  it("rejects an invalid ttl", async () => {
    const h = harness(status(201));
    for (const ttlSeconds of [-1, 1.5, Number.NaN]) {
      expect(await h.sender.send(request({ ttlSeconds }))).toEqual({ kind: "rejected", reason: "invalid_ttl" });
    }
    expect(h.calls).toHaveLength(0);
  });

  it("rejects when the VAPID configuration cannot sign, without a request", async () => {
    const h = harness(status(201), { vapid: { ...vapid, privateKey: encodeBase64Url(new Uint8Array(32)) } });
    expect(await h.sender.send(request())).toEqual({ kind: "rejected", reason: "invalid_vapid_config" });
    expect(h.calls).toHaveLength(0);
  });
});

describe("WebPushSender — what is logged", () => {
  const secrets = [ENDPOINT, "JzLQ3raZJfFBR0aqvOMsLrt54w4rJUsV", UA_PUBLIC, UA_AUTH, "Order #1001", "secret=1"];

  it("logs the host, the status and an event name for each failure, and nothing sensitive", async () => {
    const outcomes: Array<() => Harness> = [
      () => harness(status(410)),
      () => harness(status(429)),
      () => harness(status(401)),
      () => harness(() => { throw new TypeError(`failed ${ENDPOINT}`); }),
    ];
    for (const make of outcomes) {
      const h = make();
      await h.sender.send(request());
      expect(h.logs).toHaveLength(1);
      const text = JSON.stringify(h.logs);
      for (const secret of secrets) expect(text).not.toContain(secret);
      expect(h.logs[0]?.host).toBe("push.example.net");
    }
  });

  it("names the events", async () => {
    const events: string[] = [];
    for (const code of [410, 503, 403]) {
      const h = harness(status(code));
      await h.sender.send(request());
      events.push(h.logs[0]?.event ?? "none");
    }
    expect(events).toEqual(["push.gone", "push.retry", "push.rejected"]);
  });

  it("does not log a send that succeeded, and never logs the payload or reasons that contain secrets", async () => {
    const h = harness(status(201));
    await h.sender.send(request());
    expect(h.logs).toEqual([]);
    const refused = harness(status(201));
    const result = await refused.sender.send(request({ payload: "Order #1001 " + "x".repeat(4000) }));
    expect(JSON.stringify([result, refused.logs])).not.toContain("Order #1001");
  });
});
