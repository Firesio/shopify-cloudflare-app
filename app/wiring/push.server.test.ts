import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { generateVapidKeys } from "~/lib/web-push/vapid";
import { runWithRequestContext } from "~/request-context.server";
import { pushConfig, pushSender } from "~/wiring.server";

function inContext<T>(overrides: Record<string, unknown>, run: () => T): T {
  return runWithRequestContext(Object.assign({}, env, { SHOPIFY_APP_URL: "https://app.example-shop.dev" }, overrides), run);
}

describe("push wiring", () => {
  it("is not configured without VAPID keys: no sender, empty public key", () => {
    inContext({ VAPID_PUBLIC_KEY: "" }, () => {
      expect(pushSender()).toBeUndefined();
      expect(pushConfig()).toEqual({ configured: false, publicKey: "" });
    });
  });

  it("is not configured with a public key but no private key", async () => {
    const keys = await generateVapidKeys();
    inContext({ VAPID_PUBLIC_KEY: keys.publicKey }, () => {
      expect(pushSender()).toBeUndefined();
      expect(pushConfig().configured).toBe(false);
    });
  });

  it("is not configured when a key is malformed or the private key is not a string", async () => {
    const keys = await generateVapidKeys();
    inContext({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: "short" }, () => {
      expect(pushSender()).toBeUndefined();
    });
    inContext({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: 42 }, () => {
      expect(pushSender()).toBeUndefined();
    });
  });

  it("is not configured when the app URL cannot be a VAPID subject", async () => {
    const keys = await generateVapidKeys();
    inContext({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, SHOPIFY_APP_URL: "http://localhost:3000" }, () => {
      expect(pushSender()).toBeUndefined();
    });
  });

  it("builds a sender and exposes the public key when both keys are valid", async () => {
    const keys = await generateVapidKeys();
    inContext({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey }, () => {
      expect(pushSender()).toBeDefined();
      expect(pushConfig()).toEqual({ configured: true, publicKey: keys.publicKey });
    });
  });

  it("builds a fresh sender per call: no state kept between requests", async () => {
    const keys = await generateVapidKeys();
    inContext({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey }, () => {
      expect(pushSender()).not.toBe(pushSender());
    });
  });
});
