import { beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "~/lib/token";
import { MAX_DEVICES_PER_ADMIN, type StaffNotificationDeps } from "./deps";
import { loadSettings, setPreference } from "./settings";
import { registerDevice, removeDevice, sendTest, setDeviceEnabled } from "./devices";
import { FakePushSubscriptions, FakeStaffPreferences } from "~/test/fake-staff-notifications";
import { fakeRuntime } from "~/test/fake-runtime";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const P256DH = "B".repeat(87);
const AUTH = "a".repeat(22);

function subscription(endpoint: string, keys: { p256dh?: string; auth?: string } = {}): string {
  return JSON.stringify({ endpoint, expirationTime: null, keys: { p256dh: keys.p256dh ?? P256DH, auth: keys.auth ?? AUTH } });
}

let devices: FakePushSubscriptions;
let preferences: FakeStaffPreferences;
let tested: string[];
let testResult: (id: string) => Promise<number>;
let runtime: ReturnType<typeof fakeRuntime>;

function deps(over: Partial<StaffNotificationDeps> = {}): StaffNotificationDeps {
  return {
    devices,
    preferences,
    runtime,
    push: { configured: true, publicKey: "PUBLIC" },
    testPush: async (id) => {
      tested.push(id);
      return testResult(id);
    },
    ...over,
  };
}

beforeEach(() => {
  devices = new FakePushSubscriptions();
  preferences = new FakeStaffPreferences();
  tested = [];
  runtime = fakeRuntime({ idPrefix: "dev" });
  testResult = async () => 1;
});

describe("loadSettings", () => {
  it("returns every topic with its default, no devices, and the push configuration", async () => {
    const view = await loadSettings("a", deps());
    expect(view.matrix.map((row) => row.topic)).toEqual(["support_ticket_opened", "support_ticket_reply", "shop_installed", "shop_uninstalled", "webhook_dead_letter"]);
    expect(view.matrix.find((row) => row.topic === "shop_installed")).toMatchObject({ email: false, push: true });
    expect(view.devices).toEqual([]);
    expect(view.push).toEqual({ configured: true, publicKey: "PUBLIC", maxDevices: MAX_DEVICES_PER_ADMIN });
  });

  it("applies the person's stored choices over the defaults", async () => {
    await preferences.set("a", "shop_installed", "email", true);
    await preferences.set("a", "support_ticket_opened", "push", false);
    const view = await loadSettings("a", deps());
    expect(view.matrix.find((row) => row.topic === "shop_installed")?.email).toBe(true);
    expect(view.matrix.find((row) => row.topic === "support_ticket_opened")?.push).toBe(false);
  });

  it("shows a device by id and endpoint hash, never the endpoint or keys", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/secret-token";
    await registerDevice({ adminId: "a", subscription: subscription(endpoint), userAgent: ANDROID }, deps());
    const view = await loadSettings("a", deps());
    expect(view.devices).toHaveLength(1);
    expect(view.devices[0]).toMatchObject({ label: "Chrome on Android", kind: "phone", enabled: true, lastUsedAt: null, endpointHash: await hashToken(endpoint) });
    const text = JSON.stringify(view);
    expect(text).not.toContain("secret-token");
    expect(text).not.toContain(P256DH);
    expect(text).not.toContain(AUTH);
  });

  it("blanks the public key when push is not configured", async () => {
    const view = await loadSettings("a", deps({ push: { configured: false, publicKey: "LEFTOVER" } }));
    expect(view.push).toEqual({ configured: false, publicKey: "", maxDevices: MAX_DEVICES_PER_ADMIN });
  });

  it("does not show another person's devices or choices", async () => {
    await registerDevice({ adminId: "a", subscription: subscription("https://fcm.googleapis.com/a"), userAgent: ANDROID }, deps());
    await preferences.set("a", "shop_installed", "push", false);
    const view = await loadSettings("b", deps());
    expect(view.devices).toEqual([]);
    expect(view.matrix.find((row) => row.topic === "shop_installed")?.push).toBe(true);
  });
});

describe("setPreference", () => {
  it("stores one choice for the person", async () => {
    const result = await setPreference({ adminId: "a", topic: "shop_uninstalled", channel: "email", enabled: true }, deps());
    expect(result).toEqual({ ok: true, value: { topic: "shop_uninstalled", channel: "email" } });
    expect(preferences.has("a", "shop_uninstalled", "email")).toBe(true);
    expect(preferences.has("b", "shop_uninstalled", "email")).toBe(false);
  });

  it("can switch a default-on choice off", async () => {
    await setPreference({ adminId: "a", topic: "support_ticket_reply", channel: "push", enabled: false }, deps());
    expect(preferences.has("a", "support_ticket_reply", "push")).toBe(false);
  });
});

describe("registerDevice", () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/abc";

  it("stores the device with a label and kind from the user agent", async () => {
    const result = await registerDevice({ adminId: "a", subscription: subscription(endpoint), userAgent: ANDROID }, deps());
    expect(result).toEqual({ ok: true, value: { id: "dev-1" } });
    expect(devices.rows).toEqual([
      expect.objectContaining({ id: "dev-1", adminUserId: "a", endpoint, p256dh: P256DH, auth: AUTH, label: "Chrome on Android", kind: "phone", enabled: true }),
    ]);
  });

  it("refuses everything when push is not configured, before looking at the input", async () => {
    const result = await registerDevice({ adminId: "a", subscription: "not json", userAgent: ANDROID }, deps({ push: { configured: false, publicKey: "" } }));
    expect(result).toEqual({ ok: false, reason: "push_unavailable" });
    expect(devices.rows).toEqual([]);
  });

  it.each([
    ["not JSON", "{nope"],
    ["empty", ""],
    ["an array", "[]"],
    ["no keys", JSON.stringify({ endpoint })],
    ["no endpoint", JSON.stringify({ keys: { p256dh: P256DH, auth: AUTH } })],
    ["a non-string endpoint", JSON.stringify({ endpoint: 5, keys: { p256dh: P256DH, auth: AUTH } })],
    ["a short p256dh", subscription(endpoint, { p256dh: "short" })],
    ["a p256dh with a bad character", subscription(endpoint, { p256dh: "B".repeat(86) + "+" })],
    ["a short auth", subscription(endpoint, { auth: "x" })],
    ["a long auth", subscription(endpoint, { auth: "x".repeat(33) })],
    ["an over-long payload", subscription(endpoint, { p256dh: "B".repeat(5000) })],
    ["an over-long endpoint", JSON.stringify({ endpoint: `https://fcm.googleapis.com/${"a".repeat(2100)}`, keys: { p256dh: P256DH, auth: AUTH } })],
  ])("rejects %s as invalid", async (_name, raw) => {
    expect(await registerDevice({ adminId: "a", subscription: raw, userAgent: ANDROID }, deps())).toEqual({ ok: false, reason: "invalid" });
    expect(devices.rows).toEqual([]);
  });

  it.each([
    "https://evil.example/push",
    "http://fcm.googleapis.com/x",
    "https://fcm.googleapis.com@evil.com/x",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost:8787/x",
  ])("rejects the endpoint %s as not allowed", async (bad) => {
    expect(await registerDevice({ adminId: "a", subscription: subscription(bad), userAgent: ANDROID }, deps())).toEqual({
      ok: false,
      reason: "endpoint_not_allowed",
    });
    expect(devices.rows).toEqual([]);
  });

  it("refuses an eleventh device but lets an existing endpoint be registered again", async () => {
    const shared = deps();
    for (let i = 0; i < MAX_DEVICES_PER_ADMIN; i += 1) {
      const added = await registerDevice({ adminId: "a", subscription: subscription(`https://fcm.googleapis.com/d${i}`), userAgent: ANDROID }, shared);
      expect(added.ok).toBe(true);
    }
    expect(await registerDevice({ adminId: "a", subscription: subscription("https://fcm.googleapis.com/extra"), userAgent: ANDROID }, shared)).toEqual({
      ok: false,
      reason: "too_many_devices",
    });
    const again = await registerDevice({ adminId: "a", subscription: subscription("https://fcm.googleapis.com/d3", { auth: "n".repeat(22) }), userAgent: ANDROID }, shared);
    expect(again.ok).toBe(true);
    expect(devices.rows.filter((row) => row.adminUserId === "a")).toHaveLength(MAX_DEVICES_PER_ADMIN);
    expect(devices.rows.find((row) => row.endpoint.endsWith("/d3"))?.auth).toBe("n".repeat(22));
  });

  it("another person's full device list does not block this person", async () => {
    for (let i = 0; i < MAX_DEVICES_PER_ADMIN; i += 1) {
      await registerDevice({ adminId: "a", subscription: subscription(`https://fcm.googleapis.com/d${i}`), userAgent: ANDROID }, deps());
    }
    const result = await registerDevice({ adminId: "b", subscription: subscription("https://fcm.googleapis.com/mine"), userAgent: ANDROID }, deps());
    expect(result.ok).toBe(true);
  });

  it("registering again keeps the original id and reports it", async () => {
    const shared = deps();
    const first = await registerDevice({ adminId: "a", subscription: subscription(endpoint), userAgent: ANDROID }, shared);
    const second = await registerDevice({ adminId: "a", subscription: subscription(endpoint), userAgent: ANDROID }, shared);
    expect(first).toEqual({ ok: true, value: { id: "dev-1" } });
    expect(second).toEqual({ ok: true, value: { id: "dev-1" } });
    expect(devices.rows).toHaveLength(1);
  });

  it("an endpoint registered by someone else moves to the registering person", async () => {
    await registerDevice({ adminId: "a", subscription: subscription(endpoint), userAgent: ANDROID }, deps());
    const moved = await registerDevice({ adminId: "b", subscription: subscription(endpoint), userAgent: ANDROID }, deps());
    expect(moved.ok).toBe(true);
    expect(await devices.listForAdmin("a")).toEqual([]);
    expect(await devices.listForAdmin("b")).toHaveLength(1);
  });

  it("falls back to an unknown label for an unrecognised agent", async () => {
    await registerDevice({ adminId: "a", subscription: subscription(endpoint), userAgent: "" }, deps());
    expect(devices.rows[0]).toMatchObject({ label: "Unknown browser", kind: "desktop" });
  });
});

describe("setDeviceEnabled and removeDevice", () => {
  async function register(adminId = "a") {
    const result = await registerDevice({ adminId, subscription: subscription(`https://fcm.googleapis.com/${adminId}`), userAgent: ANDROID }, deps());
    if (!result.ok) throw new Error("fixture");
    return result.value.id;
  }

  it("switches the person's own device off and on", async () => {
    const id = await register();
    expect(await setDeviceEnabled({ adminId: "a", id, enabled: false }, deps())).toEqual({ ok: true, value: null });
    expect(devices.rows[0]?.enabled).toBe(false);
    expect(await setDeviceEnabled({ adminId: "a", id, enabled: true }, deps())).toEqual({ ok: true, value: null });
    expect(devices.rows[0]?.enabled).toBe(true);
  });

  it("reports another person's or a missing device as not found, and changes nothing", async () => {
    const id = await register("a");
    expect(await setDeviceEnabled({ adminId: "b", id, enabled: false }, deps())).toEqual({ ok: false, reason: "not_found" });
    expect(await removeDevice({ adminId: "b", id }, deps())).toEqual({ ok: false, reason: "not_found" });
    expect(await setDeviceEnabled({ adminId: "a", id: "nope", enabled: false }, deps())).toEqual({ ok: false, reason: "not_found" });
    expect(devices.rows).toHaveLength(1);
    expect(devices.rows[0]?.enabled).toBe(true);
  });

  it("removes the person's own device once", async () => {
    const id = await register();
    expect(await removeDevice({ adminId: "a", id }, deps())).toEqual({ ok: true, value: null });
    expect(devices.rows).toEqual([]);
    expect(await removeDevice({ adminId: "a", id }, deps())).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("sendTest", () => {
  async function register(adminId: string, path: string) {
    const result = await registerDevice({ adminId, subscription: subscription(`https://fcm.googleapis.com/${path}`), userAgent: ANDROID }, deps());
    if (!result.ok) throw new Error("fixture");
    return result.value.id;
  }

  it("tests one device of the person", async () => {
    const id = await register("a", "one");
    await register("a", "two");
    expect(await sendTest({ adminId: "a", id }, deps())).toEqual({ ok: true, value: { sent: 1 } });
    expect(tested).toEqual([id]);
  });

  it("tests every enabled device when no id is given, skipping disabled ones", async () => {
    const one = await register("a", "one");
    const two = await register("a", "two");
    const off = await register("a", "off");
    await setDeviceEnabled({ adminId: "a", id: off, enabled: false }, deps());
    expect(await sendTest({ adminId: "a" }, deps())).toEqual({ ok: true, value: { sent: 2 } });
    expect(tested).toEqual([one, two]);
  });

  it("tests a disabled device when asked for it by id", async () => {
    const id = await register("a", "one");
    await setDeviceEnabled({ adminId: "a", id, enabled: false }, deps());
    expect(await sendTest({ adminId: "a", id }, deps())).toEqual({ ok: true, value: { sent: 1 } });
  });

  it("will not test another person's device, and sends nothing", async () => {
    const id = await register("a", "one");
    expect(await sendTest({ adminId: "b", id }, deps())).toEqual({ ok: false, reason: "not_found" });
    expect(tested).toEqual([]);
  });

  it("is not found for an unknown id and for a person with no enabled device", async () => {
    expect(await sendTest({ adminId: "a", id: "nope" }, deps())).toEqual({ ok: false, reason: "not_found" });
    expect(await sendTest({ adminId: "a" }, deps())).toEqual({ ok: false, reason: "not_found" });
  });

  it("is push_unavailable when push is not configured, and sends nothing", async () => {
    const id = await register("a", "one");
    expect(await sendTest({ adminId: "a", id }, deps({ push: { configured: false, publicKey: "" } }))).toEqual({ ok: false, reason: "push_unavailable" });
    expect(tested).toEqual([]);
  });

  it("is test_failed when nothing was delivered", async () => {
    const id = await register("a", "one");
    testResult = async () => 0;
    expect(await sendTest({ adminId: "a", id }, deps())).toEqual({ ok: false, reason: "test_failed" });
  });

  it("is test_failed, not a throw, when sending raises, and still counts the devices that worked", async () => {
    const bad = await register("a", "bad");
    const good = await register("a", "good");
    testResult = async (id) => {
      if (id === bad) throw new Error("push service down");
      return 1;
    };
    expect(await sendTest({ adminId: "a" }, deps())).toEqual({ ok: true, value: { sent: 1 } });
    expect(tested).toEqual([bad, good]);
    testResult = async () => {
      throw new Error("down");
    };
    expect(await sendTest({ adminId: "a" }, deps())).toEqual({ ok: false, reason: "test_failed" });
  });
});
