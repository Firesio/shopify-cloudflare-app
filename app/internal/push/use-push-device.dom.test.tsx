import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, data, RouterProvider, useLoaderData } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeviceView, NotificationActionResult } from "~/domain/staff-notification-view";
import { encodeBase64Url } from "~/lib/base64url";
import { installPushBrowser, IPHONE_UA, NEW_ENDPOINT, type PushBrowser, type PushBrowserOptions } from "~/test/fake-push-browser";
import { hashEndpoint } from "./encoding";
import { SUBSCRIBE_TIMEOUT_MS } from "./subscription";
import { usePushDevice } from "./use-push-device";

const KEY_BYTES = new Uint8Array(65).map((_, index) => (index * 3 + 1) % 256);
const PUBLIC_KEY = encodeBase64Url(KEY_BYTES);
const OTHER_ENDPOINT = "https://push.fake-service.invalid/send/another-device";

async function device(endpoint: string, overrides: Partial<DeviceView> = {}): Promise<DeviceView> {
  return {
    id: "dev-1",
    label: "Chrome on Linux",
    kind: "desktop",
    enabled: true,
    createdAt: 1_700_000_000_000,
    lastUsedAt: null,
    endpointHash: await hashEndpoint(endpoint),
    ...overrides,
  };
}

/** The hook's whole surface as text, so each assertion reads one labelled line. */
function Harness() {
  const { devices } = useLoaderData<{ devices: DeviceView[] }>();
  const push = usePushDevice({ publicKey: PUBLIC_KEY, devices });
  return (
    <div>
      <p>support: {push.support}</p>
      <p>busy: {push.busy}</p>
      <p>error: {push.error ?? "none"}</p>
      <p>subscribedHere: {String(push.subscribedHere)}</p>
      <p>thisDevice: {push.thisDevice?.label ?? "none"}</p>
      <p>result: {push.result === undefined ? "none" : JSON.stringify(push.result)}</p>
      <button onClick={push.enable}>enable</button>
      <button onClick={push.disable}>disable</button>
    </div>
  );
}

type Submission = Record<string, string>;
let browser: PushBrowser | null = null;

afterEach(() => {
  cleanup();
  browser?.restore();
  browser = null;
});

async function mount(
  options: PushBrowserOptions,
  initialDevices: readonly DeviceView[] = [],
  respond: (submission: Submission) => NotificationActionResult = () => ({ success: "subscribed", id: "dev-new" }),
) {
  browser = installPushBrowser(options);
  const submissions: Submission[] = [];
  let devices = [...initialDevices];
  const router = createMemoryRouter(
    [
      {
        path: "/internal/notifications",
        Component: Harness,
        loader: () => ({ devices }),
        action: async ({ request }) => {
          const submission: Submission = {};
          for (const [name, value] of await request.formData()) if (typeof value === "string") submission[name] = value;
          submissions.push(submission);
          const result = respond(submission);
          if ("error" in result) return data(result, { status: 400 });
          if (submission["intent"] === "subscribe") {
            devices = [...devices, await device(NEW_ENDPOINT, { id: "dev-new", label: "Chrome on Android" })];
          }
          if (submission["intent"] === "device-remove") devices = devices.filter((entry) => entry.id !== submission["id"]);
          return data(result);
        },
      },
    ],
    { initialEntries: ["/internal/notifications"] },
  );
  render(<RouterProvider router={router} />);
  return { submissions, browser };
}

const line = (text: string) => screen.findByText(text);

describe("what this browser can do", () => {
  it("is unsupported when there is no service worker", async () => {
    await mount({ serviceWorker: false });
    expect(await line("support: unsupported")).toBeTruthy();
  });

  it("is unsupported when the page is not a secure context", async () => {
    await mount({ secureContext: false });
    expect(await line("support: unsupported")).toBeTruthy();
  });

  it("asks an iPhone in a Safari tab to install the app first (PushManager does not even exist there)", async () => {
    await mount({ userAgent: IPHONE_UA, pushManager: false, standalone: false });
    expect(await line("support: ios-needs-install")).toBeTruthy();
  });

  it("lets an installed iPhone app ask for permission", async () => {
    const { browser: fake } = await mount({ userAgent: IPHONE_UA, standalone: true });
    expect(await line("support: default")).toBeTruthy();
    await waitFor(() => expect(fake.registrations).toHaveLength(1));
  });

  it("reports blocked notifications as denied and never registers a worker for it", async () => {
    const { browser: fake } = await mount({ permission: "denied" });
    expect(await line("support: denied")).toBeTruthy();
    expect(fake.registrations).toEqual([]);
  });
});

describe("recognising this device", () => {
  it("registers the console's worker with scope /internal/", async () => {
    const { browser: fake } = await mount({});
    await waitFor(() => expect(fake.registrations).toEqual([{ url: "/internal-sw.js", scope: "/internal/" }]));
  });

  it("finds its own registration by the endpoint hash, without any click or prompt", async () => {
    const { browser: fake } = await mount({ permission: "granted", existing: { endpoint: NEW_ENDPOINT, key: KEY_BYTES } }, [
      await device(OTHER_ENDPOINT, { id: "dev-other", label: "Firefox on Windows" }),
      await device(NEW_ENDPOINT),
    ]);
    expect(await line("thisDevice: Chrome on Linux")).toBeTruthy();
    expect(screen.getByText("subscribedHere: true")).toBeTruthy();
    expect(fake.prompts()).toBe(0);
  });

  it("does not claim a device that only shares a label: another endpoint is another device", async () => {
    await mount({ permission: "granted", existing: { endpoint: NEW_ENDPOINT, key: KEY_BYTES } }, [await device(OTHER_ENDPOINT)]);
    expect(await line("subscribedHere: true")).toBeTruthy();
    expect(screen.getByText("thisDevice: none")).toBeTruthy();
  });
});

describe("enable", () => {
  it("prompts, subscribes with the server key (userVisibleOnly) and posts the subscription as the subscribe intent", async () => {
    const { submissions, browser: fake } = await mount({});
    await waitFor(() => expect(fake.registrations).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "enable" }));

    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(fake.prompts()).toBe(1);
    expect(fake.subscribeCalls).toHaveLength(1);
    expect(fake.subscribeCalls[0]?.userVisibleOnly).toBe(true);
    expect(fake.subscribeCalls[0]?.applicationServerKey).toEqual(KEY_BYTES);

    const [submission] = submissions;
    expect(Object.keys(submission ?? {}).sort()).toEqual(["intent", "subscription"]);
    expect(submission?.["intent"]).toBe("subscribe");
    expect(JSON.parse(submission?.["subscription"] ?? "null")).toEqual({
      endpoint: NEW_ENDPOINT,
      expirationTime: null,
      keys: { p256dh: "fake-p256dh", auth: "fake-auth" },
    });
  });

  it("becomes registered once the server list contains this endpoint's hash", async () => {
    await mount({});
    fireEvent.click(await screen.findByRole("button", { name: "enable" }));
    expect(await line("thisDevice: Chrome on Android")).toBeTruthy();
    expect(screen.getByText('result: {"success":"subscribed","id":"dev-new"}')).toBeTruthy();
    expect(screen.getByText("busy: idle")).toBeTruthy();
  });

  it("shows busy while the browser steps and the server call run", async () => {
    await mount({});
    fireEvent.click(await screen.findByRole("button", { name: "enable" }));
    expect(screen.getByText("busy: enabling")).toBeTruthy();
    await line("busy: idle");
  });

  it("surfaces a denied prompt, subscribes to nothing and posts nothing", async () => {
    const { submissions, browser: fake } = await mount({ promptAnswer: "denied" });
    fireEvent.click(await screen.findByRole("button", { name: "enable" }));

    expect(await line("error: permission-denied")).toBeTruthy();
    expect(fake.subscribeCalls).toEqual([]);
    expect(submissions).toEqual([]);
    // The permission is re-read after the prompt, so the support state follows it.
    expect(await line("support: denied")).toBeTruthy();
    expect(screen.getByText("busy: idle")).toBeTruthy();
  });

  it("tells a dismissed prompt from a denied one", async () => {
    const { submissions } = await mount({ promptAnswer: "default" });
    fireEvent.click(await screen.findByRole("button", { name: "enable" }));
    expect(await line("error: permission-dismissed")).toBeTruthy();
    expect(submissions).toEqual([]);
  });

  it("surfaces a push service failure and posts nothing", async () => {
    const { submissions } = await mount({ subscribeFails: true });
    fireEvent.click(await screen.findByRole("button", { name: "enable" }));
    expect(await line("error: subscribe-failed")).toBeTruthy();
    expect(submissions).toEqual([]);
    expect(screen.getByText("thisDevice: none")).toBeTruthy();
  });

  it("gives up on a push service that never answers instead of spinning forever", async () => {
    const { submissions } = await mount({ subscribeHangs: true });
    const enable = await screen.findByRole("button", { name: "enable" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      fireEvent.click(enable);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(SUBSCRIBE_TIMEOUT_MS + 1);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(await line("error: push-service-timeout")).toBeTruthy();
    expect(submissions).toEqual([]);
  });

  it("surfaces a worker that could not be registered", async () => {
    await mount({ registerFails: true });
    expect(await line("error: registration-failed")).toBeTruthy();
  });

  it("replaces a subscription that was made with a different key instead of failing on it", async () => {
    const { submissions, browser: fake } = await mount({ permission: "granted", existing: { endpoint: OTHER_ENDPOINT, key: new Uint8Array([9, 9, 9]) } });
    await waitFor(() => expect(fake.registrations).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: "enable" }));

    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(fake.unsubscribed()).toBe(1);
    expect(fake.currentEndpoint()).toBe(NEW_ENDPOINT);
    expect(fake.prompts()).toBe(1);
  });

  it("reuses the existing subscription when the key matches, rather than subscribing twice", async () => {
    const { submissions, browser: fake } = await mount({ permission: "granted", existing: { endpoint: OTHER_ENDPOINT, key: KEY_BYTES } });
    fireEvent.click(await screen.findByRole("button", { name: "enable" }));
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(fake.subscribeCalls).toEqual([]);
    expect(JSON.parse(submissions[0]?.["subscription"] ?? "{}").endpoint).toBe(OTHER_ENDPOINT);
  });

  it("surfaces the server's refusal and stays unregistered", async () => {
    await mount({}, [], () => ({ error: "too_many_devices" }));
    fireEvent.click(await screen.findByRole("button", { name: "enable" }));
    expect(await line('result: {"error":"too_many_devices"}')).toBeTruthy();
    expect(screen.getByText("thisDevice: none")).toBeTruthy();
  });

  it("surfaces an invalid server key without ever subscribing", async () => {
    browser = installPushBrowser({});
    function BadKey() {
      const push = usePushDevice({ publicKey: "not base64!", devices: [] });
      return (
        <>
          <button onClick={push.enable}>enable</button>
          <p>error: {push.error ?? "none"}</p>
        </>
      );
    }
    const router = createMemoryRouter([{ path: "/internal/notifications", Component: BadKey }], { initialEntries: ["/internal/notifications"] });
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByRole("button", { name: "enable" }));
    expect(await line("error: key-invalid")).toBeTruthy();
    expect(browser.subscribeCalls).toEqual([]);
  });
});

describe("disable", () => {
  it("drops the browser subscription and removes the device row", async () => {
    const { submissions, browser: fake } = await mount({ permission: "granted", existing: { endpoint: NEW_ENDPOINT, key: KEY_BYTES } }, [
      await device(NEW_ENDPOINT),
    ]);
    await line("thisDevice: Chrome on Linux");

    fireEvent.click(screen.getByRole("button", { name: "disable" }));

    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toEqual({ intent: "device-remove", id: "dev-1" });
    expect(fake.unsubscribed()).toBe(1);
    expect(fake.currentEndpoint()).toBeNull();
    expect(await line("thisDevice: none")).toBeTruthy();
    expect(screen.getByText("subscribedHere: false")).toBeTruthy();
  });

  it("only unsubscribes when the browser holds a subscription the server never registered", async () => {
    const { submissions, browser: fake } = await mount({ permission: "granted", existing: { endpoint: OTHER_ENDPOINT, key: KEY_BYTES } });
    await line("subscribedHere: true");
    fireEvent.click(screen.getByRole("button", { name: "disable" }));
    await line("subscribedHere: false");
    expect(fake.unsubscribed()).toBe(1);
    expect(submissions).toEqual([]);
  });
});
