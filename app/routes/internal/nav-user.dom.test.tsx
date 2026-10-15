import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SidebarProvider } from "~/internal/components/ui/sidebar";
import { NavUser } from "./nav-user";

beforeAll(() => {
  // Radix Popper measures with ResizeObserver, and the sidebar reads matchMedia; jsdom has neither.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub, configurable: true });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
});

afterEach(cleanup);

function mount() {
  const logouts: string[] = [];
  const router = createMemoryRouter(
    [
      {
        path: "/internal/dashboard",
        element: (
          <SidebarProvider>
            <NavUser user={{ name: "Local Admin", email: "admin@localhost" }} />
          </SidebarProvider>
        ),
      },
      {
        path: "/internal/logout",
        action: ({ request }) => {
          logouts.push(request.method);
          return null;
        },
      },
    ],
    { initialEntries: ["/internal/dashboard"] },
  );
  render(<RouterProvider router={router} />);
  return logouts;
}

describe("the account menu", () => {
  it("shows who is signed in and offers Account and Log out", async () => {
    mount();
    fireEvent.keyDown(screen.getByRole("button", { name: /Local Admin/ }), { key: "Enter" });

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("admin@localhost")).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Account" }).getAttribute("href")).toBe("/internal/profile");
    expect(within(menu).getByRole("menuitem", { name: "Log out" })).toBeTruthy();
  });

  it("signs out with a POST to the logout route, never a link", async () => {
    const logouts = mount();
    fireEvent.keyDown(screen.getByRole("button", { name: /Local Admin/ }), { key: "Enter" });
    const item = await screen.findByRole("menuitem", { name: "Log out" });
    expect(item.getAttribute("href")).toBeNull();

    fireEvent.click(item);

    await waitFor(() => expect(logouts).toEqual(["POST"]));
  });
});
