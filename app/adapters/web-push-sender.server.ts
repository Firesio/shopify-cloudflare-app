import { decodeBase64Url, encodeBase64Url } from "~/lib/base64url";
import type { VapidConfig } from "~/lib/vapid-config";
import { encryptPayload, type EncryptPayloadFailure } from "~/lib/web-push/encrypt";
import { generateP256KeyPair, type P256KeyPair } from "~/lib/web-push/keys";
import { err, ok, type Result } from "~/lib/result";
import { importVapidKeys, vapidAuthorization } from "~/lib/web-push/vapid";
import type { PushRequest, PushResult, PushSender } from "~/ports/push-sender";
import type { RandomBytes } from "~/ports/runtime";

const SALT_BYTES = 16;
const DEFAULT_TIMEOUT_MS = 10_000;
/** RFC 8030 section 5.4: a topic is at most 32 characters from the URL-safe base64 alphabet. */
const TOPIC = /^[A-Za-z0-9_-]{1,32}$/;
const TOPIC_HASH_BYTES = 24; // 24 bytes encode to exactly 32 base64url characters

/** A structured, secret-free record of a push that did not go through: the push service's host and a status, never the endpoint. */
export interface PushLogEntry {
  readonly event: "push.gone" | "push.retry" | "push.rejected";
  readonly host: string;
  readonly reason?: string;
  readonly status?: number;
}

export interface WebPushSenderDeps {
  readonly vapid: VapidConfig;
  readonly fetch: typeof fetch;
  /** Epoch milliseconds. */
  readonly now: () => number;
  readonly randomBytes: RandomBytes;
  /** The sender's per-message ECDH key pair. Defaults to a fresh WebCrypto pair; tests inject a fixed one. */
  readonly generateKeyPair?: () => Promise<P256KeyPair>;
  readonly log: (entry: PushLogEntry) => void;
  readonly timeoutMs?: number;
}

type PrepareFailure =
  | "invalid_subscription_key"
  | "invalid_vapid_config"
  | "invalid_endpoint"
  | "encryption_failed"
  | "payload_too_large";

interface PreparedRequest {
  readonly body: Uint8Array<ArrayBuffer>;
  readonly authorization: string;
}

const encryptionReasons: Record<EncryptPayloadFailure, PrepareFailure> = {
  invalid_user_agent_key: "invalid_subscription_key",
  invalid_auth_secret: "invalid_subscription_key",
  invalid_salt: "encryption_failed",
  invalid_sender_key: "encryption_failed",
  payload_too_large: "payload_too_large",
};

/**
 * Sends Web Push messages: RFC 8291 encryption, RFC 8292 VAPID, RFC 8030 delivery. It only translates the push
 * service's answer into a `PushResult`; what to do with it (forget the device, retry, give up) is the caller's.
 *
 * Neither the endpoint, the subscription keys nor the payload ever appears in a reason or a log entry: the endpoint
 * is a bearer capability to wake that device.
 */
export class WebPushSender implements PushSender {
  constructor(private readonly deps: WebPushSenderDeps) {}

  async send(request: PushRequest): Promise<PushResult> {
    const host = hostOf(request.target.endpoint);
    if (host === null) return this.failed("rejected", "invalid", "invalid_endpoint");
    if (!Number.isInteger(request.ttlSeconds) || request.ttlSeconds < 0) return this.failed("rejected", host, "invalid_ttl");

    const prepared = await this.prepare(request);
    if (!prepared.ok) return this.failed("rejected", host, prepared.reason);

    return this.deliver(host, request, prepared.value);
  }

  /** Encrypt the payload and sign the request; the failures here are all ones a retry cannot fix. */
  private async prepare(request: PushRequest): Promise<Result<PreparedRequest, PrepareFailure>> {
    const userAgentPublicKey = decodeBase64Url(request.target.p256dh);
    const authSecret = decodeBase64Url(request.target.auth);
    if (userAgentPublicKey === null || authSecret === null) return err("invalid_subscription_key");

    const keys = await importVapidKeys(this.deps.vapid);
    if (!keys.ok) return err("invalid_vapid_config");
    const authorization = await vapidAuthorization({
      key: keys.value,
      endpoint: request.target.endpoint,
      subject: this.deps.vapid.subject,
      nowSeconds: Math.floor(this.deps.now() / 1000),
    });
    if (!authorization.ok) return err(authorization.reason === "invalid_endpoint" ? "invalid_endpoint" : "invalid_vapid_config");

    const generateKeyPair = this.deps.generateKeyPair ?? (() => generateP256KeyPair("ECDH", false));
    const encrypted = await encryptPayload({
      plaintext: new TextEncoder().encode(request.payload),
      userAgentPublicKey,
      authSecret,
      salt: this.deps.randomBytes(SALT_BYTES),
      senderKeys: await generateKeyPair(),
    });
    if (!encrypted.ok) return err(encryptionReasons[encrypted.reason]);
    return ok({ body: encrypted.value, authorization: authorization.value });
  }

  private async deliver(
    host: string,
    request: PushRequest,
    prepared: PreparedRequest,
  ): Promise<PushResult> {
    const headers: Record<string, string> = {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(request.ttlSeconds),
      Urgency: request.urgency,
      Authorization: prepared.authorization,
    };
    if (request.topic !== undefined) headers.Topic = await topicHeader(request.topic);

    // Called as a bare function: a Workers `fetch` invoked as a method of another object throws "Illegal invocation".
    const send = this.deps.fetch;
    let response: Response;
    try {
      response = await send(request.target.endpoint, {
        method: "POST",
        headers,
        body: prepared.body,
        // A redirect would replay the VAPID token at a host we never meant to authenticate to.
        redirect: "manual",
        signal: AbortSignal.timeout(this.deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return this.failed("retry", host, timedOut ? "timeout" : "network_error");
    }
    // Release the connection; the body of a push service reply carries nothing we use.
    await response.body?.cancel();
    return this.classify(host, response.status);
  }

  private classify(host: string, status: number): PushResult {
    if (status === 200 || status === 201 || status === 202) return { kind: "sent" };
    if (status === 404 || status === 410) {
      this.deps.log({ event: "push.gone", host, status });
      return { kind: "gone" };
    }
    const transient = status === 429 || (status >= 500 && status <= 599);
    return this.failed(transient ? "retry" : "rejected", host, `http_${status}`, status);
  }

  private failed(kind: "retry" | "rejected", host: string, reason: string, status?: number): PushResult {
    if (status === undefined) {
      this.deps.log({ event: `push.${kind}`, host, reason });
      return { kind, reason };
    }
    this.deps.log({ event: `push.${kind}`, host, reason, status });
    return { kind, reason, status };
  }
}

function hostOf(endpoint: string): string | null {
  if (!URL.canParse(endpoint)) return null;
  const url = new URL(endpoint);
  return url.protocol === "https:" ? url.host : null;
}

/** A topic already in the allowed alphabet and length is sent as is; anything else becomes a stable 32-character digest. */
async function topicHeader(topic: string): Promise<string> {
  if (TOPIC.test(topic)) return topic;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(topic));
  return encodeBase64Url(new Uint8Array(digest).slice(0, TOPIC_HASH_BYTES));
}
