import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import { env } from "cloudflare:test";
import { runWithRequestContext } from "~/request-context.server";
import { setupTestDatabase } from "~/test/db";
import { AdminUserRepo } from "~/models/admin-users.server";
import { createAdmin } from "~/services/admin-management.server";
import { createAdminSession, HOME_PATH } from "~/services/admin-auth.server";
import { generateVapidKeys } from "~/lib/web-push/vapid";
import { MAX_DEVICES_PER_ADMIN } from "~/services/staff-notifications";
import { fakeRuntime } from "~/test/fake-runtime";
import { defined } from "~/test/defined";
import { action, loader } from "./notifications";

/**
 * The settings route's SERVER side, against real local D1 and KV: the real loader and action, the real wiring, real
 * sessions. The page component is a Polaris-free shadcn UI and is verified by hand, not here.
 */
setupTestDatabase();

const PASSWORD = "a-long-enough-password";
const ORIGIN = "https://console.workmanjsc.vn";
const PATH = "/internal/notifications";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);
const authDeps = { users: new AdminUserRepo(), runtime: fakeRuntime() };

let vapid: { publicKey: string; privateKey: string };
beforeEach(async () => {
  vapid = await generateVapidKeys();
});

function inRequest<T>(fn: () => Promise<T>, configured = true): Promise<T> {
  // A Record, so the overrides merge over `Env` without its literal-typed vars (the real ones are config, not types).
  const overrides: Record<string, unknown> = configured
    ? { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, SHOPIFY_APP_URL: "https://app.example-shop.dev" }
    : { VAPID_PUBLIC_KEY: "" };
  return runWithRequestContext({ ...env, ...overrides }, fn);
}

async function signedIn(email: string, role: "owner" | "admin" = "admin"): Promise<{ cookie: string; id: string }> {
  const created = await createAdmin({ name: "Test", email, password: PASSWORD, role }, authDeps);
  if (!created.ok) throw new Error(`fixture: ${created.reason}`);
  const response = await createAdminSession(created.value.id, HOME_PATH);
  const header = response.headers.get("Set-Cookie");
  if (!header) throw new Error("expected a Set-Cookie header");
  return { cookie: defined(header.split(";")[0]), id: created.value.id };
}

function routeArgs(request: Request) {
  return { request, params: {}, context: new RouterContextProvider(), url: new URL(request.url), pattern: PATH };
}

function get(cookie?: string) {
  return routeArgs(new Request(`${ORIGIN}${PATH}`, { headers: cookie ? { Cookie: cookie } : {} }));
}

function post(fields: Record<string, string>, options: { cookie?: string; origin?: string | null; userAgent?: string } = {}) {
  const headers: Record<string, string> = { "User-Agent": options.userAgent ?? ANDROID };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.origin !== null) headers.Origin = options.origin ?? ORIGIN;
  return routeArgs(new Request(`${ORIGIN}${PATH}`, { method: "POST", headers, body: new URLSearchParams(fields) }));
}

function subscription(endpoint: string): string {
  return JSON.stringify({ endpoint, expirationTime: null, keys: { p256dh: P256DH, auth: AUTH } });
}

async function thrown(run: Promise<unknown>): Promise<Response> {
  const error = await run.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof Response)) throw new Error("expected a thrown Response");
  return error;
}

async function submit(args: ReturnType<typeof post>) {
  const result = await action(args);
  return { body: result.data, status: result.init?.status ?? 200 };
}

describe("loader", () => {
  it("redirects an unauthenticated request to sign in, remembering where it was headed", async () => {
    await inRequest(async () => {
      const response = await thrown(loader(get()));
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(`/internal/login?next=${encodeURIComponent(PATH)}`);
    });
  });

  it("redirects a disabled account", async () => {
    await inRequest(async () => {
      const { cookie, id } = await signedIn("gone@workmanjsc.vn");
      await new AdminUserRepo().setStatus(id, "disabled", 1);
      expect((await thrown(loader(get(cookie)))).status).toBe(302);
    });
  });

  it("gives a non-owner their own settings: every topic at its default, no devices", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("plain@workmanjsc.vn", "admin");
      const view = await loader(get(cookie));
      expect(view.matrix.map((row) => row.topic)).toEqual(["support_ticket_opened", "support_ticket_reply", "shop_installed", "shop_uninstalled"]);
      expect(view.devices).toEqual([]);
      expect(view.push).toEqual({ configured: true, publicKey: vapid.publicKey, maxDevices: MAX_DEVICES_PER_ADMIN });
    });
  });

  it("says push is not configured, with no key, when the deployment has none", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("plain@workmanjsc.vn");
      expect((await loader(get(cookie))).push).toEqual({ configured: false, publicKey: "", maxDevices: MAX_DEVICES_PER_ADMIN });
    }, false);
  });
});

describe("action: access", () => {
  it("redirects an unauthenticated post and changes nothing", async () => {
    await inRequest(async () => {
      const response = await thrown(action(post({ intent: "preference", topic: "shop_installed", channel: "email", enabled: "true" })));
      expect(response.status).toBe(302);
    });
  });

  it("redirects a disabled account (the authoritative repo, not the cached lookup)", async () => {
    await inRequest(async () => {
      const { cookie, id } = await signedIn("gone@workmanjsc.vn");
      await loader(get(cookie)); // warms the advisory session cache while the account is still active
      await new AdminUserRepo().setStatus(id, "disabled", 1);
      const response = await thrown(action(post({ intent: "preference", topic: "shop_installed", channel: "email", enabled: "true" }, { cookie })));
      expect(response.status).toBe(302);
    });
  });

  it.each([
    ["another origin", "https://evil.example"],
    ["a lookalike origin", "https://console.workmanjsc.vn.evil.example"],
    ["the null origin", "null"],
  ])("refuses a post from %s with 403 and changes nothing", async (_name, origin) => {
    await inRequest(async () => {
      const { cookie } = await signedIn("plain@workmanjsc.vn");
      const response = await thrown(action(post({ intent: "preference", topic: "shop_installed", channel: "email", enabled: "true" }, { cookie, origin })));
      expect(response.status).toBe(403);
      expect((await loader(get(cookie))).matrix.find((row) => row.topic === "shop_installed")?.email).toBe(false);
    });
  });

  it("accepts a post with the same origin, and one with no Origin header", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("plain@workmanjsc.vn");
      const fields = { intent: "preference", topic: "shop_installed", channel: "email", enabled: "true" };
      expect((await submit(post(fields, { cookie }))).status).toBe(200);
      expect((await submit(post(fields, { cookie, origin: null }))).status).toBe(200);
    });
  });
});

describe("action: preference", () => {
  it("stores a choice that the loader then reflects, for this person only", async () => {
    await inRequest(async () => {
      const a = await signedIn("a@workmanjsc.vn");
      const b = await signedIn("b@workmanjsc.vn");
      const result = await submit(post({ intent: "preference", topic: "shop_installed", channel: "email", enabled: "true" }, { cookie: a.cookie }));
      expect(result).toEqual({ body: { success: "preference", topic: "shop_installed", channel: "email" }, status: 200 });
      await submit(post({ intent: "preference", topic: "support_ticket_opened", channel: "push", enabled: "false" }, { cookie: a.cookie }));

      const own = await loader(get(a.cookie));
      expect(own.matrix.find((row) => row.topic === "shop_installed")).toMatchObject({ email: true, push: true });
      expect(own.matrix.find((row) => row.topic === "support_ticket_opened")?.push).toBe(false);

      const other = await loader(get(b.cookie));
      expect(other.matrix.find((row) => row.topic === "shop_installed")?.email).toBe(false);
      expect(other.matrix.find((row) => row.topic === "support_ticket_opened")?.push).toBe(true);
    });
  });

  it("switching a choice back is stored too", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      await submit(post({ intent: "preference", topic: "shop_installed", channel: "email", enabled: "true" }, { cookie }));
      await submit(post({ intent: "preference", topic: "shop_installed", channel: "email", enabled: "false" }, { cookie }));
      expect((await loader(get(cookie))).matrix.find((row) => row.topic === "shop_installed")?.email).toBe(false);
    });
  });

  it.each([
    ["an unknown topic", { topic: "world_peace", channel: "email", enabled: "true" }],
    ["an unknown channel", { topic: "shop_installed", channel: "sms", enabled: "true" }],
    ["a non-boolean flag", { topic: "shop_installed", channel: "email", enabled: "yes" }],
    ["a missing topic", { channel: "email", enabled: "true" }],
    ["a missing flag", { topic: "shop_installed", channel: "email" }],
  ])("rejects %s as invalid", async (_name, fields) => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      expect(await submit(post({ intent: "preference", ...fields }, { cookie }))).toEqual({ body: { error: "invalid" }, status: 400 });
    });
  });
});

describe("action: intent handling", () => {
  it.each([
    ["no intent", {}],
    ["an empty intent", { intent: "" }],
    ["an unknown intent", { intent: "delete-everything" }],
    ["an inherited property name", { intent: "constructor" }],
  ])("answers %s with 400 invalid", async (_name, fields) => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      expect(await submit(post(fields, { cookie }))).toEqual({ body: { error: "invalid" }, status: 400 });
    });
  });
});

describe("action: devices", () => {
  const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc";

  async function subscribe(cookie: string, endpoint = ENDPOINT) {
    const result = await submit(post({ intent: "subscribe", subscription: subscription(endpoint) }, { cookie }));
    if (!("success" in result.body) || result.body.success !== "subscribed") throw new Error(`fixture: ${JSON.stringify(result)}`);
    return result.body.id;
  }

  it("registers the browser, labelled from its user agent, and the page gets a hash, never the endpoint", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      const id = await subscribe(cookie);
      const view = await loader(get(cookie));
      expect(view.devices).toEqual([expect.objectContaining({ id, label: "Chrome on Android", kind: "phone", enabled: true })]);
      const serialized = JSON.stringify(view);
      expect(serialized).not.toContain("fcm.googleapis.com");
      expect(serialized).not.toContain(P256DH);
      expect(defined(view.devices[0]).endpointHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it("subscribing twice keeps one device", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      const first = await subscribe(cookie);
      const second = await subscribe(cookie);
      expect(second).toBe(first);
      expect((await loader(get(cookie))).devices).toHaveLength(1);
    });
  });

  it("switches a device off and on, then removes it", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      const id = await subscribe(cookie);
      expect(await submit(post({ intent: "device-enabled", id, enabled: "false" }, { cookie }))).toEqual({ body: { success: "device-enabled" }, status: 200 });
      expect(defined((await loader(get(cookie))).devices[0]).enabled).toBe(false);
      await submit(post({ intent: "device-enabled", id, enabled: "true" }, { cookie }));
      expect(defined((await loader(get(cookie))).devices[0]).enabled).toBe(true);
      expect(await submit(post({ intent: "device-remove", id }, { cookie }))).toEqual({ body: { success: "device-removed" }, status: 200 });
      expect((await loader(get(cookie))).devices).toEqual([]);
      expect(await submit(post({ intent: "device-remove", id }, { cookie }))).toEqual({ body: { error: "not_found" }, status: 400 });
    });
  });

  it.each([
    ["not JSON", "{nope"],
    ["missing keys", JSON.stringify({ endpoint: ENDPOINT })],
    ["short keys", JSON.stringify({ endpoint: ENDPOINT, keys: { p256dh: "x", auth: "y" } })],
    ["empty", ""],
    ["a huge body", "x".repeat(5000)],
  ])("rejects a subscription that is %s as invalid", async (_name, raw) => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      expect(await submit(post({ intent: "subscribe", subscription: raw }, { cookie }))).toEqual({ body: { error: "invalid" }, status: 400 });
      expect((await loader(get(cookie))).devices).toEqual([]);
    });
  });

  it.each([
    "https://evil.example/push",
    "http://fcm.googleapis.com/x",
    "https://fcm.googleapis.com@evil.com/x",
    "https://169.254.169.254/latest",
  ])("refuses the endpoint %s", async (endpoint) => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      expect(await submit(post({ intent: "subscribe", subscription: subscription(endpoint) }, { cookie }))).toEqual({
        body: { error: "endpoint_not_allowed" },
        status: 400,
      });
      expect((await loader(get(cookie))).devices).toEqual([]);
    });
  });

  it("refuses an eleventh device", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      for (let i = 0; i < MAX_DEVICES_PER_ADMIN; i += 1) await subscribe(cookie, `https://fcm.googleapis.com/fcm/send/${i}`);
      expect(await submit(post({ intent: "subscribe", subscription: subscription("https://fcm.googleapis.com/fcm/send/extra") }, { cookie }))).toEqual({
        body: { error: "too_many_devices" },
        status: 400,
      });
      expect((await loader(get(cookie))).devices).toHaveLength(MAX_DEVICES_PER_ADMIN);
    });
  });

  it("refuses to register when push is not configured", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      expect(await submit(post({ intent: "subscribe", subscription: subscription(ENDPOINT) }, { cookie }))).toEqual({
        body: { error: "push_unavailable" },
        status: 400,
      });
    }, false);
  });

  it.each([
    ["no id", { intent: "device-enabled", enabled: "true" }],
    ["no flag", { intent: "device-enabled", id: "x" }],
    ["a bad flag", { intent: "device-enabled", id: "x", enabled: "maybe" }],
    ["an over-long id", { intent: "device-remove", id: "x".repeat(65) }],
    ["no id on remove", { intent: "device-remove" }],
  ])("rejects %s as invalid", async (_name, fields) => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      expect(await submit(post(fields, { cookie }))).toEqual({ body: { error: "invalid" }, status: 400 });
    });
  });

  describe("across admins", () => {
    it("B cannot switch off, remove or test A's device, and A's device is untouched", async () => {
      await inRequest(async () => {
        const a = await signedIn("a@workmanjsc.vn");
        const b = await signedIn("b@workmanjsc.vn");
        const id = await subscribe(a.cookie);

        const notFound = { body: { error: "not_found" }, status: 400 };
        expect(await submit(post({ intent: "device-enabled", id, enabled: "false" }, { cookie: b.cookie }))).toEqual(notFound);
        expect(await submit(post({ intent: "device-remove", id }, { cookie: b.cookie }))).toEqual(notFound);
        expect(await submit(post({ intent: "test", id }, { cookie: b.cookie }))).toEqual(notFound);

        expect((await loader(get(b.cookie))).devices).toEqual([]);
        expect(await loader(get(a.cookie))).toMatchObject({ devices: [expect.objectContaining({ id, enabled: true })] });
      });
    });

    it("B registering A's endpoint moves it: A loses it, B has it", async () => {
      await inRequest(async () => {
        const a = await signedIn("a@workmanjsc.vn");
        const b = await signedIn("b@workmanjsc.vn");
        const id = await subscribe(a.cookie);
        expect(await subscribe(b.cookie)).toBe(id);
        expect((await loader(get(a.cookie))).devices).toEqual([]);
        expect((await loader(get(b.cookie))).devices).toHaveLength(1);
      });
    });
  });
});

describe("action: test", () => {
  it("is not found when the person has no device", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      expect(await submit(post({ intent: "test" }, { cookie }))).toEqual({ body: { error: "not_found" }, status: 400 });
      expect(await submit(post({ intent: "test", id: "missing" }, { cookie }))).toEqual({ body: { error: "not_found" }, status: 400 });
    });
  });

  it("is push_unavailable when push is not configured", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      expect(await submit(post({ intent: "test" }, { cookie }))).toEqual({ body: { error: "push_unavailable" }, status: 400 });
    }, false);
  });

  it("rejects an over-long id as invalid", async () => {
    await inRequest(async () => {
      const { cookie } = await signedIn("a@workmanjsc.vn");
      expect(await submit(post({ intent: "test", id: "x".repeat(65) }, { cookie }))).toEqual({ body: { error: "invalid" }, status: 400 });
    });
  });
});
