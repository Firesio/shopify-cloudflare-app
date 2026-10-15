import { z } from "zod";
import { err, ok, type Result } from "~/lib/result";

/** A real subscription is a few hundred bytes; anything near this is not one. */
export const MAX_SUBSCRIPTION_JSON_LENGTH = 4096;

/** base64url without padding, which is how `PushSubscription.toJSON()` writes keys. */
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * `PushSubscription.toJSON()`: the push service URL plus the two keys a message
 * is encrypted to. The P-256 public key is 65 bytes (87 characters) and the auth
 * secret 16 bytes (22); the bounds are looser than that so a future encoding
 * change is not refused, but tight enough that garbage and giants are. Unknown
 * members (`expirationTime`) are dropped, never stored. Whether the endpoint's
 * host may be contacted is a separate decision (`isAllowedPushEndpoint`).
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().min(1).max(2048),
  keys: z.object({
    p256dh: z.string().min(80).max(100).regex(BASE64URL),
    auth: z.string().min(16).max(32).regex(BASE64URL),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** JSON text of a subscription to a checked value. Never throws. */
export function parsePushSubscription(raw: string): Result<PushSubscriptionInput, "invalid"> {
  if (raw.length === 0 || raw.length > MAX_SUBSCRIPTION_JSON_LENGTH) return err("invalid");
  const json = z.string().transform((text, context) => {
    try {
      return JSON.parse(text);
    } catch {
      context.addIssue({ code: "custom", message: "not JSON" });
      return z.NEVER;
    }
  });
  const parsed = json.pipe(pushSubscriptionSchema).safeParse(raw);
  return parsed.success ? ok(parsed.data) : err("invalid");
}
