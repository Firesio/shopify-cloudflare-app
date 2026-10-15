import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import InternalSupport from "./index";

/**
 * The view tabs and the sortable headers are client state, so the server-render
 * tests cannot exercise them. These drive the real page in a DOM and read the
 * resulting rows by role.
 */
interface Row {
  id: string;
  shop: string;
  shopName: string;
  subject: string;
  category: "bug";
  status: "open" | "answered";
  lastMessageAt: number;
  planName: string;
  unread: boolean;
}

function row(over: Partial<Row>): Row {
  return {
    id: "t1",
    shop: "alpha.myshopify.com",
    shopName: "Alpha Store",
    subject: "Checkout is broken",
    category: "bug",
    status: "open",
    lastMessageAt: 1_700_000_000_000,
    planName: "Free",
    unread: false,
    ...over,
  };
}

const TICKETS = [
  row({ id: "a", subject: "Zebra export", status: "open" }),
  row({ id: "b", subject: "Apple import", status: "answered" }),
  row({ id: "c", subject: "Mango sync", status: "open" }),
];

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub, configurable: true });
});

afterEach(cleanup);

function mount(tickets: Row[]) {
  const router = createMemoryRouter(
    [{ path: "/internal/support", Component: InternalSupport, loader: () => ({ tickets }) }],
    { initialEntries: ["/internal/support"] },
  );
  render(<RouterProvider router={router} />);
}

/** Subjects of the ticket rows, top to bottom (the header row is skipped). */
function subjects(): string[] {
  const [, ...rows] = screen.getAllByRole("row");
  return rows.map((tableRow) => within(tableRow).getAllByRole("cell")[0]?.textContent ?? "");
}

describe("the support queue views", () => {
  it("filters the rows by whose turn it is when a view tab is chosen", async () => {
    mount(TICKETS);
    await screen.findByText("Zebra export");
    expect(subjects()).toEqual(["Zebra export", "Apple import", "Mango sync"]);

    fireEvent.mouseDown(screen.getByRole("tab", { name: /Waiting on merchant/ }), { button: 0 });
    expect(subjects()).toEqual(["Apple import"]);

    fireEvent.mouseDown(screen.getByRole("tab", { name: /Needs reply/ }), { button: 0 });
    expect(subjects()).toEqual(["Zebra export", "Mango sync"]);

    fireEvent.mouseDown(screen.getByRole("tab", { name: /^All/ }), { button: 0 });
    expect(subjects()).toHaveLength(3);
  });

  it("says so when a view has no tickets, instead of showing a bare table", async () => {
    mount([row({ id: "a", status: "open" })]);
    await screen.findByText("Checkout is broken");

    fireEvent.mouseDown(screen.getByRole("tab", { name: /Waiting on merchant/ }), { button: 0 });
    expect(screen.getByText("No tickets in this view.")).toBeTruthy();
    expect(screen.queryByText("Checkout is broken")).toBeNull();
  });
});

describe("the support queue sorting", () => {
  it("sorts by subject, ascending then descending, from the header button", async () => {
    mount(TICKETS);
    await screen.findByText("Zebra export");

    const sortBySubject = screen.getByRole("button", { name: "Subject" });
    fireEvent.click(sortBySubject);
    expect(subjects()).toEqual(["Apple import", "Mango sync", "Zebra export"]);

    fireEvent.click(sortBySubject);
    expect(subjects()).toEqual(["Zebra export", "Mango sync", "Apple import"]);
  });
});
