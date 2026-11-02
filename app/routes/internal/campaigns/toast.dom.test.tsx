import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, data, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Toaster } from "~/internal/components/ui/sonner";
import { campaignFixture, previewFixture, recipientFixture } from "~/test/campaign-views";
import CampaignDetail from "./detail";

/**
 * Starting a campaign swaps the editor for the report on the same URL. The answer to that one submission must be ONE
 * toast, not one per screen that sees it: the real Toaster is mounted and its toasts are counted.
 */
beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub, configurable: true });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }),
  });
});

afterEach(cleanup);

describe("the answer to a send", () => {
  it("is shown once, even though the page changes from the editor to the report under it", async () => {
    let started = false;
    const router = createMemoryRouter(
      [
        {
          path: "/internal/campaigns/:campaignId",
          Component: CampaignDetail,
          loader: () => ({
            actorEmail: "me@firesio.app",
            screen: started
              ? {
                  kind: "report",
                  campaign: campaignFixture({ status: "paused", recipientCount: 9 }),
                  counts: { pending: 9, sent: 0, failed: 0, refused: 0, skipped: 0 },
                  recipients: [recipientFixture()],
                  recipientStatus: null,
                  recipientLimit: 100,
                }
              : { kind: "draft", campaign: campaignFixture(), preview: previewFixture() },
          }),
          action: () => {
            started = true;
            return data({ kind: "done", message: "Sending to 9 shops. You can follow it here." });
          },
        },
      ],
      { initialEntries: ["/internal/campaigns/campaign-1"] },
    );
    render(
      <>
        <RouterProvider router={router} />
        <Toaster />
      </>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Send to 9 shops" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Send to 9 shops" }));

    // The report is up: the page really did change screens.
    await screen.findByText("Progress");
    await waitFor(() => expect(document.querySelectorAll("[data-sonner-toast]").length).toBeGreaterThan(0));
    const toasts = [...document.querySelectorAll("[data-sonner-toast]")].filter((toast) => toast.textContent?.includes("Sending to 9 shops."));
    expect(toasts).toHaveLength(1);
    expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(1);
  });
});
