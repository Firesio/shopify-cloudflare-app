import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, data, RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignStatus } from "~/domain/campaign";
import { campaignFixture, recipientFixture } from "~/test/campaign-views";
import { MAX_POLLS, POLL_INTERVAL_MS } from "./polling";
import CampaignDetail from "./detail";

/**
 * The progress report in a DOM: that it keeps itself current while sending, within its bounds, and what its controls
 * submit. A fake action stands in for the server (the intents have their own integration test).
 */
beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub, configurable: true });
});

let hidden = false;
beforeEach(() => {
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  // Only the interval is faked: the router and the DOM library still use real timers and microtasks.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface Mounted {
  readonly loads: () => number;
  readonly submissions: Record<string, string>[];
  setStatus(status: CampaignStatus): void;
}

async function mount(initial: CampaignStatus): Promise<Mounted> {
  let status = initial;
  let loads = 0;
  const submissions: Record<string, string>[] = [];
  const router = createMemoryRouter(
    [
      {
        path: "/internal/campaigns/:campaignId",
        Component: CampaignDetail,
        loader: () => {
          loads += 1;
          return {
            actorEmail: "me@firesio.app",
            screen: {
              kind: "report",
              campaign: campaignFixture({ status, recipientCount: 10 }),
              counts: { pending: 6, sent: 4, failed: 0, refused: 0, skipped: 0 },
              recipients: [recipientFixture()],
              recipientStatus: null,
              recipientLimit: 100,
            },
          };
        },
        action: async ({ request }) => {
          const submission: Record<string, string> = {};
          for (const [key, value] of await request.formData()) if (typeof value === "string") submission[key] = value;
          submissions.push(submission);
          return data({ kind: "done", message: "ok" });
        },
      },
    ],
    { initialEntries: ["/internal/campaigns/campaign-1"] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByRole("heading", { name: "Big update" });
  return { loads: () => loads, submissions, setStatus: (next) => (status = next) };
}

const tick = (times = 1) =>
  act(async () => {
    for (let index = 0; index < times; index += 1) await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
  });

describe("while a campaign is sending", () => {
  it("reloads its numbers on a fixed interval", async () => {
    const page = await mount("sending");
    expect(page.loads()).toBe(1);
    await tick();
    expect(page.loads()).toBe(2);
    await tick(3);
    expect(page.loads()).toBe(5);
  });

  it("asks nothing while the tab is hidden, and carries on when it is visible again", async () => {
    const page = await mount("sending");
    hidden = true;
    await tick(5);
    expect(page.loads()).toBe(1);
    hidden = false;
    await tick();
    expect(page.loads()).toBe(2);
  });

  it("stops at its ceiling, and says so instead of going on for ever", async () => {
    const page = await mount("sending");
    await tick(MAX_POLLS);
    expect(page.loads()).toBe(1 + MAX_POLLS);
    await tick(2);
    expect(page.loads()).toBe(1 + MAX_POLLS);
    expect(screen.getByText(/Live updates stopped after 10 minutes/)).toBeTruthy();
  });

  it("does not count the ticks of a hidden tab against the ceiling", async () => {
    const page = await mount("sending");
    hidden = true;
    await tick(MAX_POLLS * 2);
    hidden = false;
    await tick(10);
    expect(page.loads()).toBe(11);
  });

  it("stops by itself once the campaign is no longer sending", async () => {
    const page = await mount("sending");
    page.setStatus("sent");
    await tick();
    expect(page.loads()).toBe(2);
    await waitFor(() => expect(screen.queryByText(/Updating every/)).toBeNull());
    await tick(5);
    expect(page.loads()).toBe(2);
  });

  it("stops when the page is left", async () => {
    const page = await mount("sending");
    cleanup();
    await tick(3);
    expect(page.loads()).toBe(1);
  });
});

describe("a campaign that is not sending", () => {
  it.each(["paused", "sent", "cancelled"] as const)("never polls while %s", async (status) => {
    const page = await mount(status);
    await tick(4);
    expect(page.loads()).toBe(1);
  });
});

describe("the controls", () => {
  it("pauses a sending campaign with just the intent", async () => {
    const page = await mount("sending");
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(page.submissions).toEqual([{ intent: "pause" }]));
  });

  it("resumes a paused one", async () => {
    const page = await mount("paused");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(page.submissions).toEqual([{ intent: "resume" }]));
  });

  it("confirms before cancelling, says how many will not receive it, then cancels", async () => {
    const page = await mount("sending");
    fireEvent.click(screen.getByRole("button", { name: "Cancel campaign" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/The 6 shops still waiting will not receive it/)).toBeTruthy();
    expect(page.submissions).toEqual([]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel campaign" }));
    await waitFor(() => expect(page.submissions).toEqual([{ intent: "cancel" }]));
  });

  it("keeps sending when the person changes their mind", async () => {
    const page = await mount("sending");
    fireEvent.click(screen.getByRole("button", { name: "Cancel campaign" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Keep sending" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(page.submissions).toEqual([]);
  });
});
