import { describe, expect, it } from "vitest";
import { describeDevice, isAllowedPushEndpoint, MAX_PUSH_ENDPOINT_LENGTH } from "./push-device";

const UA = {
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  chromeAndroidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
  safariIpad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  firefoxWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
  edgeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  chromeLinux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  opera: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0",
  chromeOs: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
} as const;

describe("describeDevice", () => {
  it.each([
    [UA.chromeAndroid, "Chrome on Android", "phone"],
    [UA.chromeAndroidTablet, "Chrome on Android", "tablet"],
    [UA.safariIphone, "Safari on iPhone", "phone"],
    [UA.chromeIphone, "Chrome on iPhone", "phone"],
    [UA.safariIpad, "Safari on iPad", "tablet"],
    [UA.firefoxWindows, "Firefox on Windows", "desktop"],
    [UA.firefoxAndroid, "Firefox on Android", "phone"],
    [UA.edgeWindows, "Edge on Windows", "desktop"],
    [UA.safariMac, "Safari on macOS", "desktop"],
    [UA.chromeLinux, "Chrome on Linux", "desktop"],
    [UA.samsung, "Samsung Internet on Android", "phone"],
    [UA.opera, "Opera on Windows", "desktop"],
    [UA.chromeOs, "Chrome on ChromeOS", "desktop"],
  ] as const)("describes %s", (ua, label, kind) => {
    expect(describeDevice(ua)).toEqual({ label, kind });
  });

  it("falls back for an unknown or empty agent", () => {
    expect(describeDevice("")).toEqual({ label: "Unknown browser", kind: "desktop" });
    expect(describeDevice("curl/8.0")).toEqual({ label: "Unknown browser", kind: "desktop" });
  });

  it("names the system when only the browser is unknown, and the browser when only the system is", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0)").label).toBe("Unknown browser on Windows");
    expect(describeDevice("Firefox/127.0").label).toBe("Firefox");
  });

  it("never echoes the user agent and stays bounded", () => {
    const hostile = `<script>alert(1)</script>${"A".repeat(10_000)} Firefox/1 Windows`;
    const { label } = describeDevice(hostile);
    expect(label).not.toContain("<");
    expect(label.length).toBeLessThanOrEqual(40);
  });

  it("only inspects a bounded prefix", () => {
    expect(describeDevice(`${"x".repeat(600)} Firefox/127.0`).label).toBe("Unknown browser");
  });

  it("does not throw on a non-string", () => {
    // Called through Reflect so a wrong-typed value reaches it without a type assertion.
    expect(() => Reflect.apply(describeDevice, undefined, [undefined])).not.toThrow();
    expect(Reflect.apply(describeDevice, undefined, [null]).label).toBe("Unknown browser");
  });
});

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://android.googleapis.com/gcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://push.services.mozilla.com/wpush/v1/abc",
    "https://web.push.apple.com/QGp3AZ",
    "https://api.push.apple.com/3/device/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://notify.windows.com/w/",
    "https://fcm.googleapis.com/fcm/send/a?x=1#frag",
  ])("allows %s", (url) => {
    expect(isAllowedPushEndpoint(url)).toBe(true);
  });

  it.each([
    ["userinfo before the allowed host", "https://fcm.googleapis.com@evil.com/x"],
    ["userinfo with credentials", "https://user:pass@fcm.googleapis.com/x"],
    ["allowed host as the userinfo of another", "https://fcm.googleapis.com:443@evil.com/"],
    ["backslash authority trick", "https://evil.com\\@fcm.googleapis.com/"],
    ["backslash after the host", "https://evil.com\\.fcm.googleapis.com/"],
    ["lookalike prefix", "https://evilfcm.googleapis.com.evil.com/x"],
    ["allowed host as a label of another domain", "https://fcm.googleapis.com.evil.com/x"],
    ["suffix without a dot boundary", "https://notnotify.windows.com/x"],
    ["suffix without a dot boundary (apple)", "https://evilpush.apple.com/x"],
    ["allowed name in the path only", "https://evil.com/fcm.googleapis.com"],
    ["allowed name in the query only", "https://evil.com/?h=fcm.googleapis.com"],
    ["allowed name in the fragment", "https://evil.com/#fcm.googleapis.com"],
    ["http", "http://fcm.googleapis.com/x"],
    ["no scheme", "fcm.googleapis.com/x"],
    ["protocol-relative", "//fcm.googleapis.com/x"],
    ["other scheme", "ftp://fcm.googleapis.com/x"],
    ["javascript scheme", "javascript:alert(1)//fcm.googleapis.com"],
    ["explicit port", "https://fcm.googleapis.com:8443/x"],
    ["default port spelled out", "https://fcm.googleapis.com:443/x"],
    ["IPv4 literal", "https://142.250.80.74/x"],
    ["IPv6 literal", "https://[::1]/x"],
    ["decimal IP", "https://2130706433/x"],
    ["localhost", "https://localhost/x"],
    ["uppercase scheme", "HTTPS://fcm.googleapis.com/x"],
    ["uppercase host", "https://FCM.GOOGLEAPIS.COM/x"],
    ["trailing dot", "https://fcm.googleapis.com./x"],
    ["trailing dot on a suffix", "https://x.push.apple.com./x"],
    ["IDN homoglyph", "https://fcm.googleapis.cоm/x"],
    ["IDN host", "https://fcm.googleapis.com.xn--e1afmkfd.com/x"],
    ["unicode full stop", "https://fcm.googleapis。com/x"],
    ["percent-encoded host", "https://fcm%2Egoogleapis.com/x"],
    ["tab inside the host", "https://fcm.googleapis.com\t.evil.com/x"],
    ["newline inside", "https://fcm.googleapis.com/x\nHost: evil.com"],
    ["leading space", " https://fcm.googleapis.com/x"],
    ["trailing space", "https://fcm.googleapis.com/x "],
    ["empty host", "https:///x"],
    ["bare scheme", "https://"],
    ["empty", ""],
    ["a different google host", "https://www.googleapis.com/x"],
    ["a different apple host", "https://apple.com/x"],
    ["only the suffix label", "https://push.apple.com.evil/x"],
    ["double dot", "https://x..push.apple.com/x"],
  ])("rejects %s", (_name, url) => {
    expect(isAllowedPushEndpoint(url)).toBe(false);
  });

  it("rejects an over-long url and accepts one at the limit", () => {
    const prefix = "https://fcm.googleapis.com/";
    expect(isAllowedPushEndpoint(prefix + "a".repeat(MAX_PUSH_ENDPOINT_LENGTH - prefix.length))).toBe(true);
    expect(isAllowedPushEndpoint(prefix + "a".repeat(MAX_PUSH_ENDPOINT_LENGTH - prefix.length + 1))).toBe(false);
  });

  it("does not throw on a non-string", () => {
    expect(Reflect.apply(isAllowedPushEndpoint, undefined, [undefined])).toBe(false);
    expect(Reflect.apply(isAllowedPushEndpoint, undefined, [42])).toBe(false);
  });
});
