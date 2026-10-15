import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, data, RouterProvider } from "react-router";
import { toast } from "sonner";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildMatrix } from "~/domain/staff-notification-topics";
import type { DeviceView, NotificationActionResult, NotificationSettingsView } from "~/domain/staff-notification-view";
import { Toaster } from "~/internal/components/ui/sonner";
import { hashEndpoint } from "~/internal/push/encoding";
import { installPushBrowser, IPHONE_UA, NEW_ENDPOINT, type PushBrowser, type PushBrowserOptions } from "~/test/fake-push-browser";
import { deviceView, settingsView } from "~/test/notification-settings-fixtures";
import { NotificationsPage } from "./page";

/**
 * The page in a DOM, with a fake action standing in for the server (the intents themselves are covered
 * by the route's own tests) and the browser's push APIs faked at their boundary. These assert what the
 * page SUBMITTED and what it showed while waiting, which is the contract the real action depends on.
 * Real layout, and real phones, are not exercised here.
 */
type Submission = Record<string, string>;
type Respond = (submission: Submission, state: { view: NotificationSettingsView }) => NotificationActionResult | Promise<NotificationActionResult>;

beforeAll(() => {
  // Radix Switch measures with ResizeObserver, which jsdom does not provide.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub, configurable: true });
});

let browser: PushBrowser | null = null;
afterEach(() => {
  cleanup();
  // Sonner's toast queue is shared by the whole file; clear it so a test only sees its own toasts.
  toast.dismiss();
  browser?.restore();
  browser = null;
});

function mount(initial: NotificationSettingsView, options: { browser?: PushBrowserOptions; respond?: Respond } = {}) {
  browser = installPushBrowser(options.browser ?? {});
  const submissions: Submission[] = [];
  const state = { view: initial };
  const respond: Respond = options.respond ?? (() => ({ success: "device-enabled" }));
  const router = createMemoryRouter(
    [
      {
        path: "/internal/notifications",
        Component: NotificationsPage,
        loader: () => state.view,
        action: async ({ request }) => {
          const submission: Submission = {};
          for (const [name, value] of await request.formData()) if (typeof value === "string") submission[name] = value;
          submissions.push(submission);
          const result = await respond(submission, state);
          return "error" in result ? data(result, { status: 400 }) : data(result);
        },
      },
    ],
    { initialEntries: ["/internal/notifications"] },
  );
  render(
    <>
      <Toaster theme="light" />
      <RouterProvider router={router} />
    </>,
  );
  return { submissions, state, browser };
}

/** A promise a test resolves by hand, so a "pending" state can be observed before the action answers. */
function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

const toasts = () => document.querySelectorAll("[data-sonner-toast]");
const toggle = (name: string) => screen.findByRole("switch", { name });

describe("saving a preference", () => {
  it("submits the topic, channel and new value the moment the switch is flipped", async () => {
    const { submissions } = mount(settingsView(), { respond: () => ({ success: "preference", topic: "support_ticket_opened", channel: "email" }) });

    fireEvent.click(await toggle("New support ticket by email"));

    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toEqual({ intent: "preference", topic: "support_ticket_opened", channel: "email", enabled: "false" });
  });

  it("turns a switch that is off on, and sends push as its own channel", async () => {
    const { submissions } = mount(settingsView(), { respond: () => ({ success: "preference", topic: "shop_installed", channel: "email" }) });
    fireEvent.click(await toggle("New install by email"));
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toEqual({ intent: "preference", topic: "shop_installed", channel: "email", enabled: "true" });

    fireEvent.click(await toggle("Uninstall by push"));
    await waitFor(() => expect(submissions).toHaveLength(2));
    expect(submissions[1]).toEqual({ intent: "preference", topic: "shop_uninstalled", channel: "push", enabled: "false" });
  });

  it("shows the new value and a spinner on that one cell while saving, and nothing on its neighbours", async () => {
    const held = gate();
    const { state } = mount(settingsView(), {
      respond: async (submission, current) => {
        await held.opened;
        current.view = {
          ...current.view,
          matrix: buildMatrix([{ topic: "support_ticket_opened", channel: "email", enabled: submission["enabled"] === "true" }]),
        };
        return { success: "preference", topic: "support_ticket_opened", channel: "email" };
      },
    });

    const cell = await toggle("New support ticket by email");
    expect(cell.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(cell);

    await waitFor(() => expect(cell.getAttribute("aria-checked")).toBe("false"));
    expect(cell.getAttribute("aria-busy")).toBe("true");
    expect(screen.getAllByRole("status", { name: "Loading" })).toHaveLength(1);
    expect(screen.getByRole("switch", { name: "New support ticket by push" }).getAttribute("aria-busy")).toBe("false");

    held.open();
    await waitFor(() => expect(cell.getAttribute("aria-busy")).toBe("false"));
    expect(cell.getAttribute("aria-checked")).toBe("false");
    expect(state.view.matrix[0]?.email).toBe(false);
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });

  it("puts the switch back and toasts the reason when the save fails", async () => {
    mount(settingsView(), { respond: () => ({ error: "invalid" }) });
    const cell = await toggle("Merchant reply by email");

    fireEvent.click(cell);

    expect(await screen.findByText("That request was not valid. Reload the page and try again.")).toBeTruthy();
    await waitFor(() => expect(cell.getAttribute("aria-checked")).toBe("true"));
  });

  it("says nothing on success: the switch is its own confirmation", async () => {
    const { submissions } = mount(settingsView(), { respond: () => ({ success: "preference", topic: "support_ticket_opened", channel: "email" }) });
    await waitFor(() => expect(toasts()).toHaveLength(0));
    fireEvent.click(await toggle("New support ticket by email"));
    await waitFor(() => expect(submissions).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading" })).toBeNull());
    expect(toasts()).toHaveLength(0);
  });
});

describe("a device's controls", () => {
  const devices: readonly DeviceView[] = [
    deviceView({ id: "d1", label: "Chrome on Linux" }),
    deviceView({ id: "d2", label: "Safari on iPhone", kind: "phone", endpointHash: "1".repeat(64) }),
  ];

  it("switches one device off by id, showing the new state at once", async () => {
    const held = gate();
    const { submissions } = mount(settingsView({ devices }), {
      respond: async () => {
        await held.opened;
        return { success: "device-enabled" };
      },
    });
    const cell = await toggle("Receive push on Safari on iPhone");
    fireEvent.click(cell);

    await waitFor(() => expect(cell.getAttribute("aria-checked")).toBe("false"));
    expect(submissions[0]).toEqual({ intent: "device-enabled", enabled: "false", id: "d2" });
    // The other device is untouched.
    expect(screen.getByRole("switch", { name: "Receive push on Chrome on Linux" }).getAttribute("aria-checked")).toBe("true");
    held.open();
    expect(await screen.findByText("Device updated.")).toBeTruthy();
  });

  it("sends a test to that device only, with a spinner on its button, and toasts how many were reached", async () => {
    const held = gate();
    const { submissions } = mount(settingsView({ devices }), {
      respond: async () => {
        await held.opened;
        return { success: "test-sent", sent: 1 };
      },
    });
    const button = await screen.findByRole("button", { name: "Send test notification to Chrome on Linux" });
    fireEvent.click(button);

    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(true));
    expect(within(button).getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "Send test notification to Safari on iPhone" })).queryByRole("status")).toBeNull();
    held.open();
    expect(await screen.findByText("Test sent to 1 device.")).toBeTruthy();
    expect(submissions).toEqual([{ intent: "test", id: "d1" }]);
  });

  it("sends the global test with no id, meaning every enabled device", async () => {
    const { submissions } = mount(settingsView({ devices }), { respond: () => ({ success: "test-sent", sent: 2 }) });
    fireEvent.click(await screen.findByRole("button", { name: "Send test notification" }));
    expect(await screen.findByText("Test sent to 2 devices.")).toBeTruthy();
    expect(submissions).toEqual([{ intent: "test" }]);
  });

  it("toasts a test that reached nobody as a failure", async () => {
    mount(settingsView({ devices }), { respond: () => ({ success: "test-sent", sent: 0 }) });
    fireEvent.click(await screen.findByRole("button", { name: "Send test notification" }));
    expect(await screen.findByText(/No device could be reached/)).toBeTruthy();
  });

  it("asks before removing: nothing is submitted until Remove is confirmed, and Cancel submits nothing", async () => {
    const { submissions, state } = mount(settingsView({ devices }), {
      respond: (submission, current) => {
        current.view = { ...current.view, devices: current.view.devices.filter((entry) => entry.id !== submission["id"]) };
        return { success: "device-removed" };
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "Remove Safari on iPhone" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Remove Safari on iPhone?" });
    expect(submissions).toEqual([]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(submissions).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Remove Safari on iPhone" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(submissions).toEqual([{ intent: "device-remove", id: "d2" }]));
    await waitFor(() => expect(screen.queryByRole("switch", { name: "Receive push on Safari on iPhone" })).toBeNull());
    expect(state.view.devices.map((entry) => entry.id)).toEqual(["d1"]);
    expect(screen.getByRole("switch", { name: "Receive push on Chrome on Linux" })).toBeTruthy();
  });

  it("toasts a device that no longer exists", async () => {
    mount(settingsView({ devices }), { respond: () => ({ error: "not_found" }) });
    fireEvent.click(await toggle("Receive push on Chrome on Linux"));
    expect(await screen.findByText("That device no longer exists. Reload the page.")).toBeTruthy();
  });
});

describe("enabling this browser", () => {
  it("registers it from a click and then shows it with a This device badge instead of the Enable button", async () => {
    const { submissions, browser: fake } = mount(settingsView(), {
      respond: async (submission, current) => {
        const hash = await hashEndpoint(NEW_ENDPOINT);
        expect(submission["intent"]).toBe("subscribe");
        current.view = { ...current.view, devices: [deviceView({ id: "dev-new", label: "Chrome on Android", endpointHash: hash })] };
        return { success: "subscribed", id: "dev-new" };
      },
    });

    const enable = await screen.findByRole("button", { name: "Enable on this device" });
    await waitFor(() => expect(enable.hasAttribute("disabled")).toBe(false));
    fireEvent.click(enable);

    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(fake.prompts()).toBe(1);
    expect(JSON.parse(submissions[0]?.["subscription"] ?? "null").endpoint).toBe(NEW_ENDPOINT);

    expect(await screen.findByText("This device")).toBeTruthy();
    expect(screen.getByText("This device will now receive notifications.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enable on this device" })).toBeNull();
    expect(screen.queryByText("No devices yet")).toBeNull();
  });

  it("badges this browser's row among others, by endpoint hash alone", async () => {
    const hash = await hashEndpoint(NEW_ENDPOINT);
    mount(
      settingsView({
        devices: [
          deviceView({ id: "other", label: "Firefox on Windows", endpointHash: "9".repeat(64) }),
          deviceView({ id: "mine", label: "Chrome on Android", endpointHash: hash }),
        ],
      }),
      { browser: { permission: "granted", existing: { endpoint: NEW_ENDPOINT } } },
    );
    const mine = await screen.findByText("This device");
    expect(mine.closest('[data-slot="item"]')?.textContent).toContain("Chrome on Android");
    expect(screen.getAllByText("This device")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Enable on this device" })).toBeNull();
  });

  it("removing this device also drops the browser's own subscription", async () => {
    const hash = await hashEndpoint(NEW_ENDPOINT);
    const { submissions, browser: fake } = mount(settingsView({ devices: [deviceView({ id: "mine", endpointHash: hash })] }), {
      browser: { permission: "granted", existing: { endpoint: NEW_ENDPOINT } },
      respond: (_submission, current) => {
        current.view = { ...current.view, devices: [] };
        return { success: "device-removed" };
      },
    });
    await screen.findByText("This device");

    fireEvent.click(screen.getByRole("button", { name: "Remove Chrome on Linux" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(submissions).toEqual([{ intent: "device-remove", id: "mine" }]));
    expect(fake.unsubscribed()).toBe(1);
    expect(fake.currentEndpoint()).toBeNull();
    expect(await screen.findByText("Device removed.")).toBeTruthy();
  });

  it("explains a denied permission and how to allow it, and offers no button that cannot work", async () => {
    mount(settingsView(), { browser: { permission: "denied" } });
    expect(await screen.findByText("Notifications are blocked for this site")).toBeTruthy();
    expect(screen.getByText(/set this site to Allow, then reload this page/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enable on this device" })).toBeNull();
  });

  it("explains the Home Screen steps on an iPhone that is not running the installed app", async () => {
    mount(settingsView(), { browser: { userAgent: IPHONE_UA, pushManager: false, standalone: false } });
    expect(await screen.findByText("Add the console to your Home Screen first")).toBeTruthy();
    expect(screen.getByText(/tap the Share button/)).toBeTruthy();
    expect(screen.getByText(/Choose Add to Home Screen/)).toBeTruthy();
    expect(screen.getByText(/Open the console from its Home Screen icon/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enable on this device" })).toBeNull();
  });

  it("offers Enable on an iPhone that IS the installed app", async () => {
    mount(settingsView(), { browser: { userAgent: IPHONE_UA, standalone: true } });
    const enable = await screen.findByRole("button", { name: "Enable on this device" });
    await waitFor(() => expect(enable.hasAttribute("disabled")).toBe(false));
    expect(screen.queryByText("Add the console to your Home Screen first")).toBeNull();
  });

  it("says plainly when the browser cannot do push at all", async () => {
    mount(settingsView(), { browser: { serviceWorker: false } });
    expect(await screen.findByText("This browser cannot receive push")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Enable on this device" })).toBeNull();
  });

  it("reports a prompt the person denies, in place and as a toast, and leaves the server alone", async () => {
    const { submissions } = mount(settingsView(), { browser: { promptAnswer: "denied" } });
    const enable = await screen.findByRole("button", { name: "Enable on this device" });
    await waitFor(() => expect(enable.hasAttribute("disabled")).toBe(false));

    fireEvent.click(enable);

    const message = "Notifications are blocked for this site. Allow them in your browser's settings, then try again.";
    // Once in place (the authoritative message) and once as the toast layered on it.
    await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(2));
    expect(submissions).toEqual([]);
    expect(await screen.findByText("Notifications are blocked for this site")).toBeTruthy();
  });

  it("reports a push service failure and lets the person try again", async () => {
    const { submissions } = mount(settingsView(), { browser: { subscribeFails: true } });
    const enable = await screen.findByRole("button", { name: "Enable on this device" });
    await waitFor(() => expect(enable.hasAttribute("disabled")).toBe(false));
    fireEvent.click(enable);

    expect((await screen.findAllByText("This browser could not create a push subscription. Try again.")).length).toBeGreaterThanOrEqual(1);
    expect(submissions).toEqual([]);
    expect(screen.getByRole("button", { name: "Enable on this device" }).hasAttribute("disabled")).toBe(false);
  });

  it("shows the server's refusal when it is over the limit, and the browser stays unregistered", async () => {
    mount(settingsView(), { respond: () => ({ error: "too_many_devices" }) });
    const enable = await screen.findByRole("button", { name: "Enable on this device" });
    await waitFor(() => expect(enable.hasAttribute("disabled")).toBe(false));
    fireEvent.click(enable);

    expect((await screen.findAllByText("You have reached the device limit. Remove a device first.")).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("This device")).toBeNull();
  });
});
