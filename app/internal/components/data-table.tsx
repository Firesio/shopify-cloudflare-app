import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Columns3,
  Search,
} from "lucide-react";
import { Button } from "~/internal/components/ui/button";
import { cn } from "~/internal/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "~/internal/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/internal/components/ui/input-group";
import { Label } from "~/internal/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/internal/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/internal/components/ui/table";

const PAGE_SIZES = [10, 20, 30, 40, 50] as const;

interface DataTableProps<TData> {
  readonly columns: ColumnDef<TData>[];
  readonly data: readonly TData[];
  /** A stable id per row, so React keeps row state across sorts and pages. */
  readonly getRowId: (row: TData) => string;
  /** Left of the toolbar: a view switcher, a filter, a heading. */
  readonly toolbarStart?: ReactNode;
  /** Right of the toolbar, after the "Columns" menu: the page's own actions. */
  readonly toolbarEnd?: ReactNode;
  /** Shown instead of the body when there are no rows. */
  readonly empty?: ReactNode;
  readonly initialPageSize?: (typeof PAGE_SIZES)[number];
  /**
   * Makes the whole row open this page. The row's own link (a title, a name)
   * stays the accessible, keyboard-reachable one; this adds a stretched link
   * behind the cells so a click anywhere on the row works, and ctrl/middle
   * click and "open in new tab" still behave like a link. Links and buttons in
   * the cells keep working on top of it.
   */
  readonly rowHref?: (row: TData) => string;
  /**
   * Column ids dropped while the page is narrow (under the `@3xl` container, so
   * a table beside an open sidebar counts as narrow too), keeping what a row is
   * about visible instead of scrolling sideways. They return at `@3xl/main`.
   */
  readonly compactHidden?: readonly string[];
  /**
   * A column pinned to the right edge while the table scrolls sideways, so a
   * row's actions menu is never scrolled out of reach on a narrow screen.
   */
  readonly stickyEnd?: string;
  /** A search box over every row (not just the current page); `text` is what a row can be found by. */
  readonly search?: { readonly placeholder: string; readonly text: (row: TData) => string };
  /** Hide the "Columns" menu on tables with only a few columns. */
  readonly columnMenu?: boolean;
}

/**
 * The dashboard-01 data table: a toolbar, a bordered table with a muted sticky
 * header, and the rows-per-page / page-x-of-y / first-prev-next-last footer.
 * Sorting, column visibility and paging are TanStack Table state, per the
 * shadcn data-table guide (docs/shadcn/components/data-table.md).
 */
export function DataTable<TData>({
  columns,
  data,
  getRowId,
  toolbarStart,
  toolbarEnd,
  empty,
  initialPageSize = 10,
  search,
  rowHref,
  compactHidden = [],
  stickyEnd,
  columnMenu = true,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [query, setQuery] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: initialPageSize });

  // TanStack recomputes the row model, and auto-resets the page index, whenever
  // `data` changes identity. A fresh copy per render would do that on every
  // render (an endless reset loop), so copy only when the caller's array changes.
  const rowData = useMemo(() => [...data], [data]);

  const table = useReactTable({
    data: rowData,
    columns,
    getRowId,
    state: { sorting, columnVisibility, pagination, globalFilter: query },
    onGlobalFilterChange: setQuery,
    globalFilterFn: (row, _columnId, value) =>
      search ? search.text(row.original).toLowerCase().includes(String(value).trim().toLowerCase()) : true,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;
  const hideable = table.getAllColumns().filter((column) => column.getCanHide());

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 lg:px-6">
        <div className="flex min-w-0 grow flex-wrap items-center gap-2">
          {search ? (
            <InputGroup className="w-full sm:w-64">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={search.placeholder}
                aria-label={search.placeholder}
              />
            </InputGroup>
          ) : null}
          {toolbarStart}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {columnMenu && hideable.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns3 />
                  <span className="hidden lg:inline">Customize columns</span>
                  <span className="lg:hidden">Columns</span>
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {hideable.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {toolbarEnd}
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan} className={cn(compactClass(compactHidden, header.column.id), header.column.id === stickyEnd && STICKY_END_HEAD)}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? (
                rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={
                      rowHref
                        ? "relative cursor-pointer [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-10 [&_button]:relative [&_button]:z-10"
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell, index) => (
                      <TableCell key={cell.id} className={cn(compactClass(compactHidden, cell.column.id), cell.column.id === stickyEnd && STICKY_END_CELL)}>
                        {rowHref && index === 0 ? (
                          <Link
                            to={rowHref(row.original)}
                            prefetch="intent"
                            data-row-link
                            aria-hidden
                            tabIndex={-1}
                            className="absolute inset-0"
                          />
                        ) : null}
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center">
                    {query.trim() !== "" ? (
                      <div className="flex flex-col items-center gap-2">
                        <span>{`No results for “${query.trim()}”.`}</span>
                        <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                          Clear search
                        </Button>
                      </div>
                    ) : (
                      (empty ?? "No results.")
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between px-4">
          <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
            {`${table.getRowCount()} ${table.getRowCount() === 1 ? "row" : "rows"}`}
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  {PAGE_SIZES.map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              {`Page ${table.getState().pagination.pageIndex + 1} of ${Math.max(1, table.getPageCount())}`}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                size="icon"
                className="hidden size-8 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to first page</span>
                <ChevronsLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <ChevronRight />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="hidden size-8 lg:flex"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to last page</span>
                <ChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STICKY_END_HEAD = "sticky right-0 z-10 bg-muted";
const STICKY_END_CELL = "sticky right-0 bg-background";
const COMPACT_HIDDEN = "hidden @3xl/main:table-cell";

function compactClass(hidden: readonly string[], columnId: string): string | undefined {
  return hidden.includes(columnId) ? COMPACT_HIDDEN : undefined;
}

/** A header that sorts on click: ghost button with the current direction as an icon. */
export function SortableHeader<TData>({ column, title }: { readonly column: Column<TData>; readonly title: string }) {
  const direction = column.getIsSorted();
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => column.toggleSorting(direction === "asc")}>
      {title}
      <Icon />
    </Button>
  );
}
