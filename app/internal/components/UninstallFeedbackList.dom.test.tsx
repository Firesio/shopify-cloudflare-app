import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { UninstallFeedbackList } from "./UninstallFeedbackList";

afterEach(cleanup);

const LONG = `${"A long and detailed reason. ".repeat(8)}END`;

const FEEDBACK = [
  {
    eventId: "evt-short",
    shop: "short.myshopify.com",
    shopName: null,
    logoUrl: null,
    occurredAt: 1_700_000_000_000,
    reason: "NOT_USING_APP",
    reasonDescription: "Too pricey",
  },
  {
    eventId: "evt-long",
    shop: "long.myshopify.com",
    shopName: "Long Store",
    logoUrl: null,
    occurredAt: 1_700_100_000_000,
    reason: null,
    reasonDescription: LONG,
  },
];

function mount(feedback: typeof FEEDBACK) {
  return render(
    <MemoryRouter>
      <UninstallFeedbackList feedback={feedback} />
    </MemoryRouter>,
  );
}

describe("UninstallFeedbackList", () => {
  it("lists each comment in its own row, linking to the shop", () => {
    mount(FEEDBACK);
    const shortRow = screen.getByRole("link", { name: "short.myshopify.com" }).closest("tr");
    expect(shortRow).not.toBeNull();
    expect(within(shortRow as HTMLElement).getByText(/Too pricey/)).toBeTruthy();
    expect(within(shortRow as HTMLElement).getByText("Not Using App")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Long Store (long.myshopify.com)" }).getAttribute("href")).toBe(
      "/internal/shops/long.myshopify.com",
    );
  });

  it("offers the full message only for long comments, and opens it in a dialog", () => {
    mount(FEEDBACK);
    const buttons = screen.getAllByRole("button", { name: "View full message" });
    expect(buttons).toHaveLength(1);

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(buttons[0] as HTMLElement);

    const dialog = screen.getByRole("dialog", { name: "Merchant exit feedback" });
    expect(within(dialog).getByText(/END/)).toBeTruthy();
    expect(within(dialog).getByText(/Long Store \(long\.myshopify\.com\)/)).toBeTruthy();
  });

  it("shows the empty state when no merchant wrote anything", () => {
    mount([]);
    expect(screen.getByText("No merchant exit feedback submitted yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View full message" })).toBeNull();
  });
});
