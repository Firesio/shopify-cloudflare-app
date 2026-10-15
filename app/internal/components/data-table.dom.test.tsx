import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { MemoryRouter } from "react-router";
import { DataTable, SortableHeader } from "./data-table";

interface Row {
  readonly id: string;
  readonly name: string;
}

const COLUMNS: ColumnDef<Row>[] = [
  {
    id: "name",
    accessorFn: (row) => row.name,
    header: ({ column }) => <SortableHeader column={column} title="Name" />,
    cell: ({ row }) => row.original.name,
  },
];

const ROWS: Row[] = Array.from({ length: 25 }, (_, index) => ({
  id: `row-${index}`,
  name: `Row ${String(index + 1).padStart(2, "0")}`,
}));

function bodyNames(): string[] {
  const [, ...bodyRows] = screen.getAllByRole("row");
  return bodyRows.map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

afterEach(cleanup);

/** Lets queued microtasks (TanStack's auto-reset of the page index) run before asserting. */
const settle = () => act(async () => { await Promise.resolve(); });

describe("DataTable paging and sorting in a browser", () => {
  it("moves to the next page and stays there", async () => {
    render(<DataTable columns={COLUMNS} data={ROWS} getRowId={(row) => row.id} />);

    expect(bodyNames()).toHaveLength(10);
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    await settle();

    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
    expect(bodyNames()[0]).toBe("Row 11");
  });

  it("sorts descending after the header is clicked twice", async () => {
    render(<DataTable columns={COLUMNS} data={ROWS} getRowId={(row) => row.id} />);

    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    await settle();
    expect(bodyNames()[0]).toBe("Row 01");
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    await settle();
    expect(bodyNames()[0]).toBe("Row 25");
  });

  it("searches every row, not just the current page, and says how many matched", async () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        getRowId={(row) => row.id}
        search={{ placeholder: "Search rows", text: (row) => row.name }}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search rows" }), { target: { value: "row 2" } });
    await settle();

    // "Row 20".."Row 25" all sit on page 3 of the unfiltered list.
    expect(bodyNames()).toEqual(["Row 20", "Row 21", "Row 22", "Row 23", "Row 24", "Row 25"]);
    expect(screen.getByText("6 rows")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  it("makes the whole row a link when rowHref is given, behind the cells' own controls", async () => {
    render(
      <MemoryRouter>
        <DataTable
          columns={COLUMNS}
          data={ROWS.slice(0, 2)}
          getRowId={(row) => row.id}
          rowHref={(row) => `/rows/${row.id}`}
        />
      </MemoryRouter>,
    );

    const [, firstRow] = screen.getAllByRole("row");
    if (!firstRow) throw new Error("expected a body row");
    const overlay = firstRow.querySelector("a[data-row-link]");
    expect(overlay?.getAttribute("href")).toBe("/rows/row-0");
    // A mouse affordance only: it is hidden from assistive tech and the tab order,
    // so a row's own link stays the one keyboard and screen-reader users reach.
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    expect(overlay?.getAttribute("tabindex")).toBe("-1");
    expect(firstRow.className).toContain("cursor-pointer");
  });

  it("leaves rows plain without rowHref", () => {
    render(<DataTable columns={COLUMNS} data={ROWS.slice(0, 2)} getRowId={(row) => row.id} />);
    expect(document.querySelector("a[data-row-link]")).toBeNull();
  });

  it("explains an empty search and offers to clear it", async () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={ROWS}
        getRowId={(row) => row.id}
        search={{ placeholder: "Search rows", text: (row) => row.name }}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Search rows" }), { target: { value: "zzz" } });
    await settle();
    expect(screen.getByText("No results for “zzz”.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    await settle();
    expect(bodyNames()).toHaveLength(10);
  });
});
