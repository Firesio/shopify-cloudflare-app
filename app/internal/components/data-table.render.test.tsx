import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, SortableHeader } from "./data-table";

interface Person {
  readonly id: string;
  readonly name: string;
  readonly age: number;
}

const COLUMNS: ColumnDef<Person>[] = [
  {
    id: "name",
    accessorFn: (person) => person.name,
    header: ({ column }) => <SortableHeader column={column} title="Name" />,
    cell: ({ row }) => row.original.name,
    enableHiding: false,
  },
  {
    id: "age",
    accessorFn: (person) => person.age,
    header: "Age",
    cell: ({ row }) => <span data-testid="age">{row.original.age}</span>,
  },
];

function people(count: number): Person[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p-${index}`,
    name: `Person ${String(index + 1).padStart(2, "0")}`,
    age: 20 + index,
  }));
}

function html(props: Partial<React.ComponentProps<typeof DataTable<Person>>> = {}): string {
  return renderToString(<DataTable columns={COLUMNS} data={people(3)} getRowId={(person) => person.id} {...props} />);
}

/** Body rows only: everything after the header row. */
function bodyRows(markup: string): string[] {
  return markup.split("<tr").slice(2);
}

describe("DataTable", () => {
  it("renders one body row per record with each cell under its column header", () => {
    const markup = html();
    const rows = bodyRows(markup);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("Person 01");
    expect(rows[0]).toContain(">20<");
    expect(rows[2]).toContain("Person 03");
    expect(markup).toContain(">Age</th>");
  });

  it("renders the sortable header as a button", () => {
    expect(html()).toMatch(/<button[^>]*>Name<svg/);
  });

  it("shows the empty slot instead of rows when there is no data", () => {
    const markup = html({ data: [], empty: <p>Nobody here yet</p> });
    expect(markup).toContain("Nobody here yet");
    expect(bodyRows(markup)).toHaveLength(1);
    expect(markup).not.toContain("Person 01");
    expect(markup).toContain("0 rows");
  });

  it("falls back to a plain message without an empty slot", () => {
    expect(html({ data: [] })).toContain("No results.");
  });

  it("shows only the first page of rows, the page count and the row total", () => {
    const markup = html({ data: people(25) });
    expect(bodyRows(markup)).toHaveLength(10);
    expect(markup).toContain("Page 1 of 3");
    expect(markup).toContain("25 rows");
    expect(markup).not.toContain("Person 11");
  });

  it("honours the initial page size", () => {
    const markup = html({ data: people(25), initialPageSize: 20 });
    expect(bodyRows(markup)).toHaveLength(20);
    expect(markup).toContain("Page 1 of 2");
  });

  it("renders the paging controls, with the first and previous buttons disabled on page one", () => {
    const markup = html({ data: people(25) });
    for (const name of ["Go to first page", "Go to previous page", "Go to next page", "Go to last page"]) {
      expect(markup, name).toContain(name);
    }
    expect(markup).toMatch(/<button[^>]*disabled=""><span class="sr-only">Go to previous page/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""><span class="sr-only">Go to next page/);
    expect(markup).toContain("Rows per page");
  });

  it("offers the column menu only when more than one column can be hidden", () => {
    expect(html()).not.toContain("Columns");
    const hideable = COLUMNS.map((column) => ({ ...column, enableHiding: true }));
    expect(html({ columns: hideable })).toContain("Columns");
    expect(html({ columns: hideable, columnMenu: false })).not.toContain("Columns");
  });

  it("puts the toolbar content on either side of the toolbar", () => {
    const markup = html({ toolbarStart: <p>Start side</p>, toolbarEnd: <button type="button">End action</button> });
    expect(markup.indexOf("Start side")).toBeGreaterThan(-1);
    expect(markup.indexOf("End action")).toBeGreaterThan(markup.indexOf("Start side"));
  });
});
