import { Card, CardHeader } from "~/internal/components/ui/card";
import { Skeleton } from "~/internal/components/ui/skeleton";
import { cn } from "~/internal/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/internal/components/ui/table";

/**
 * Placeholders for streamed regions. `aria-hidden` because they say nothing a
 * screen reader needs; the real content announces itself once it arrives.
 * Shapes mirror the final layout (same Card, same row rhythm) to avoid a jump.
 */

const STAT_COLUMNS = {
  "min-w-48": "grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]",
  "min-w-44": "grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]",
} as const;

/** A row of KPI cards, matching the stat-card rows on the console. */
export function StatRowSkeleton({ count, minWidth = "min-w-48" }: { count: number; minWidth?: "min-w-48" | "min-w-44" }) {
  return (
    <div aria-hidden className={`grid gap-4 ${STAT_COLUMNS[minWidth]}`}>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-1 h-8 w-20" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

/**
 * What `DataTable` will render: a toolbar row, a bordered table with a muted
 * header, and the paging footer. `inset` adds the page gutters `DataTable`
 * applies to itself; leave it off when the parent already pads.
 */
export function TableSkeleton({
  rows = 8,
  columns = 4,
  inset = false,
}: {
  rows?: number;
  columns?: number;
  inset?: boolean;
}) {
  return (
    <div aria-hidden className={cn("flex w-full flex-col gap-4", inset && "px-4 lg:px-6")}>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-56 max-w-1/2" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              {Array.from({ length: columns }, (_, index) => (
                <TableHead key={index}>
                  <Skeleton className="h-4 w-full" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }, (_, row) => (
              <TableRow key={row}>
                {Array.from({ length: columns }, (_, column) => (
                  <TableCell key={column}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-4">
        <Skeleton className="hidden h-4 w-16 lg:block" />
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <Skeleton className="hidden h-8 w-24 lg:block" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="size-8" />
          <Skeleton className="size-8" />
        </div>
      </div>
    </div>
  );
}
