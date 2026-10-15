import { describe, expect, it } from "vitest";
import { canEnablePush, isIosDevice, pushSupport, type PushEnvironment, type PushSupportState } from "./support";

const STATES: readonly PushSupportState[] = ["checking", "unsupported", "ios-needs-install", "denied", "default", "granted"];

const DESKTOP = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

function env(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    secureContext: true,
    hasServiceWorker: true,
    hasPushManager: true,
    permission: "default",
    userAgent: DESKTOP,
    maxTouchPoints: 0,
    standalone: false,
    ...overrides,
  };
}

describe("pushSupport", () => {
  it.each(["default", "granted"] as const)("reports the permission (%s) when everything is available", (permission) => {
    expect(pushSupport(env({ permission }))).toBe(permission);
  });

  it("reports denied when the person blocked notifications", () => {
    expect(pushSupport(env({ permission: "denied" }))).toBe("denied");
  });

  it.each([
    ["an insecure page", { secureContext: false }],
    ["no service worker", { hasServiceWorker: false }],
    ["no PushManager", { hasPushManager: false }],
    ["no Notification API", { permission: null }],
  ] as const)("is unsupported with %s", (_name, overrides) => {
    expect(pushSupport(env(overrides))).toBe("unsupported");
  });

  it("asks an iPhone in a Safari tab to install the app first, even though iOS hides PushManager there", () => {
    expect(pushSupport(env({ userAgent: IPHONE, hasPushManager: false, permission: null }))).toBe("ios-needs-install");
  });

  it("treats an iPad that identifies as a Mac the same way", () => {
    expect(pushSupport(env({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5, hasPushManager: false }))).toBe("ios-needs-install");
  });

  it("lets an installed iPhone app through to the permission state", () => {
    expect(pushSupport(env({ userAgent: IPHONE, standalone: true, permission: "granted" }))).toBe("granted");
    expect(pushSupport(env({ userAgent: IPHONE, standalone: true, permission: "denied" }))).toBe("denied");
  });

  it("does not mistake a desktop Mac for an iPad: no touch points", () => {
    expect(isIosDevice({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 })).toBe(false);
    expect(pushSupport(env({ userAgent: IPAD_AS_MAC }))).toBe("default");
  });

  it("a desktop browser is never asked to install, standalone or not", () => {
    expect(pushSupport(env({ standalone: false }))).toBe("default");
    expect(pushSupport(env({ standalone: true }))).toBe("default");
  });
});

describe("canEnablePush", () => {
  it("is true only where a click can lead to a subscription", () => {
    expect(STATES.map((state) => canEnablePush(state))).toEqual([false, false, false, false, true, true]);
  });
});
