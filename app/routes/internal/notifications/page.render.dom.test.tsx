import { cleanup, render, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider, type RouteObject } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { buildMatrix } from "~/domain/staff-notification-topics";
import type { NotificationSettingsView } from "~/domain/staff-notification-view";
import { deviceView, settingsView } from "~/test/notification-settings-fixtures";
import { NotificationsPage } from "./page";

/**
 * What the SERVER sends for the page: rendered to a string exactly as the Worker does, then loaded into
 * a DOM only so assertions can ask for a control by its role and accessible name. Nothing is hydrated, so
 * everything that depends on the browser (this device, support, permission) is in its "checking" state.
 */
afterEach(cleanup);

async function renderPage(view: NotificationSettingsView): Promise<HTMLElement> {
  const routes: RouteObject[] = [{ path: "/internal/notifications", Component: NotificationsPage, loader: () => view }];
  const context = await createStaticHandler(routes).query(new Request("https://console.workmanjsc.vn/internal/notifications"));
  if (context instanceof Response) throw new Error(`Expected a render context, got ${context.status}`);
  const html = renderToString(<StaticRouterProvider router={createStaticRouter(routes, context)} context={context} hydrate={false} />);
  expect(html.length, "rendered nothing, so every assertion would be vacuous").toBeGreaterThan(500);
  return render(<div dangerouslySetInnerHTML={{ __html: html }} />).container;
}

/** The element a selector finds, or a failure that says what was missing. */
function find(root: HTMLElement, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`nothing matches ${selector}`);
  return found;
}

/** The device row (an Item) that holds `control`. */
function rowOf(control: HTMLElement): HTMLElement {
  const row = control.closest<HTMLElement>('[data-slot="item"]');
  if (row === null) throw new Error("the control is not inside a device row");
  return row;
}

describe("the matrix", () => {
  it("lists every topic under its group, with its description", async () => {
    const page = await renderPage(settingsView());

    const support = within(find(page, 'section[aria-labelledby="pref-group-support"]'));
    expect(support.getByRole("heading", { name: "Support" })).toBeTruthy();
    expect(support.getByText("New support ticket")).toBeTruthy();
    expect(support.getByText("A merchant opens a ticket.")).toBeTruthy();
    expect(support.getByText("Merchant reply")).toBeTruthy();
    expect(support.queryByText("New install")).toBeNull();

    const shops = within(find(page, 'section[aria-labelledby="pref-group-shops"]'));
    expect(shops.getByRole("heading", { name: "Shops" })).toBeTruthy();
    expect(shops.getByText("New install")).toBeTruthy();
    expect(shops.getByText("Uninstall")).toBeTruthy();
    expect(shops.queryByText("Merchant reply")).toBeNull();
  });

  it("gives every cell a switch named for its topic and channel, set to the stored value", async () => {
    const page = await renderPage(
      settingsView({
        matrix: buildMatrix([
          { topic: "support_ticket_opened", channel: "email", enabled: false },
          { topic: "shop_uninstalled", channel: "push", enabled: false },
        ]),
      }),
    );
    const view = within(page);
    const state = (name: string) => view.getByRole("switch", { name }).getAttribute("aria-checked");

    expect(state("New support ticket by email")).toBe("false");
    expect(state("New support ticket by push")).toBe("true");
    expect(state("Merchant reply by email")).toBe("true");
    expect(state("Merchant reply by push")).toBe("true");
    expect(state("New install by email")).toBe("false");
    expect(state("New install by push")).toBe("true");
    expect(state("Uninstall by email")).toBe("false");
    expect(state("Uninstall by push")).toBe("false");
  });

  it("names the channel next to each switch, for the phone layout where the column headings are gone", async () => {
    const page = await renderPage(settingsView());
    const toggle = within(page).getByRole("switch", { name: "Merchant reply by email" });
    const label = page.querySelector(`label[for="${toggle.id}"]`);
    expect(label?.textContent).toBe("Email");
  });

  it("replaces the push switches with a note, not dead switches, when the deployment has no push", async () => {
    const page = await renderPage(settingsView({ push: { configured: false, publicKey: "", maxDevices: 5 } }));
    const view = within(page);
    expect(view.queryByRole("switch", { name: /by push$/ })).toBeNull();
    expect(view.getAllByRole("switch", { name: /by email$/ })).toHaveLength(5);
    expect(view.getAllByText("Not set up")).toHaveLength(5);
    expect(view.getByText(/only email can be changed/)).toBeTruthy();
  });
});

describe("the devices", () => {
  it("shows each device with its label, dates and controls named for it", async () => {
    const page = await renderPage(
      settingsView({
        devices: [
          deviceView({ id: "d1", label: "Chrome on Linux", lastUsedAt: 1_700_100_000_000 }),
          deviceView({ id: "d2", label: "Safari on iPhone", kind: "phone", enabled: false, endpointHash: "1".repeat(64) }),
        ],
      }),
    );
    const view = within(page);

    const linux = rowOf(view.getByRole("switch", { name: "Receive push on Chrome on Linux" }));
    expect(within(linux).getByText("Chrome on Linux")).toBeTruthy();
    expect(within(linux).getByText("Added Nov 14, 2023, 10:13 PM · Last used Nov 16, 2023, 2:00 AM")).toBeTruthy();
    expect(within(linux).getByRole("img", { name: "Computer" })).toBeTruthy();
    expect(within(linux).getByRole("button", { name: "Remove Chrome on Linux" })).toBeTruthy();

    const phone = rowOf(view.getByRole("switch", { name: "Receive push on Safari on iPhone" }));
    expect(within(phone).getByText("Added Nov 14, 2023, 10:13 PM · Never used")).toBeTruthy();
    expect(within(phone).getByRole("img", { name: "Phone" })).toBeTruthy();
    expect(within(linux).queryByText("Never used")).toBeNull();

    expect(view.getByRole("switch", { name: "Receive push on Chrome on Linux" }).getAttribute("aria-checked")).toBe("true");
    expect(view.getByRole("switch", { name: "Receive push on Safari on iPhone" }).getAttribute("aria-checked")).toBe("false");
  });

  it("cannot tell which device is this one before the browser is asked: no badge from the server", async () => {
    const page = await renderPage(settingsView({ devices: [deviceView()] }));
    expect(within(page).queryByText("This device")).toBeNull();
  });

  it("offers a test per device only while it is switched on, and a global test only when some device is", async () => {
    const page = await renderPage(
      settingsView({ devices: [deviceView({ id: "d1", label: "On one" }), deviceView({ id: "d2", label: "Off one", enabled: false, endpointHash: "1".repeat(64) })] }),
    );
    const view = within(page);
    expect(view.getByRole("button", { name: "Send test notification to On one" }).hasAttribute("disabled")).toBe(false);
    expect(view.getByRole("button", { name: "Send test notification to Off one" }).hasAttribute("disabled")).toBe(true);
    expect(view.getByRole("button", { name: "Send test notification" }).hasAttribute("disabled")).toBe(false);
  });

  it("disables the global test when there is nothing to send to", async () => {
    const none = within(await renderPage(settingsView()));
    expect(none.getByRole("button", { name: "Send test notification" }).hasAttribute("disabled")).toBe(true);
    cleanup();
    const allOff = within(await renderPage(settingsView({ devices: [deviceView({ enabled: false })] })));
    expect(allOff.getByRole("button", { name: "Send test notification" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows an empty state when there are no devices", async () => {
    const page = await renderPage(settingsView());
    expect(within(page).getByText("No devices yet")).toBeTruthy();
  });

  it("does not show the empty state when there are devices", async () => {
    const page = await renderPage(settingsView({ devices: [deviceView()] }));
    expect(within(page).queryByText("No devices yet")).toBeNull();
  });
});

describe("the enable panel before the browser is known", () => {
  it("offers a disabled Enable button rather than guessing what this browser can do", async () => {
    const page = await renderPage(settingsView());
    const enable = within(page).getByRole("button", { name: "Enable on this device" });
    expect(enable.hasAttribute("disabled")).toBe(true);
  });

  it("says push is not set up, with no Enable button, when the deployment has no keys", async () => {
    const page = await renderPage(settingsView({ push: { configured: false, publicKey: "", maxDevices: 5 } }));
    const view = within(page);
    expect(view.getByText("Push is not set up")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Enable on this device" })).toBeNull();
    expect(view.getByRole("button", { name: "Send test notification" }).hasAttribute("disabled")).toBe(true);
  });

  it("says the device limit is reached, with the limit, and no Enable button", async () => {
    const devices = [deviceView({ id: "d1", endpointHash: "1".repeat(64) }), deviceView({ id: "d2", endpointHash: "2".repeat(64) })];
    const page = await renderPage(settingsView({ devices, push: { configured: true, publicKey: "BCV0", maxDevices: 2 } }));
    const view = within(page);
    expect(view.getByText("Device limit reached")).toBeTruthy();
    expect(view.getByText(/up to 2 devices/)).toBeTruthy();
    expect(view.queryByRole("button", { name: "Enable on this device" })).toBeNull();
  });

  it("is below the limit with one slot left: the Enable button is offered", async () => {
    const devices = [deviceView({ id: "d1", endpointHash: "1".repeat(64) })];
    const page = await renderPage(settingsView({ devices, push: { configured: true, publicKey: "BCV0", maxDevices: 2 } }));
    expect(within(page).queryByText("Device limit reached")).toBeNull();
    expect(within(page).getByRole("button", { name: "Enable on this device" })).toBeTruthy();
  });
});

describe("the page frame", () => {
  it("leaves the title to the shell header: no h1 in the body", async () => {
    const page = await renderPage(settingsView({ devices: [deviceView()] }));
    expect(page.querySelector("h1")).toBeNull();
    expect(within(page).getByText("What to notify me about")).toBeTruthy();
    expect(within(page).getByText("Devices that receive push")).toBeTruthy();
  });
});
