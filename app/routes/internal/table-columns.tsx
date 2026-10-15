import type { Column } from "@tanstack/react-table";
import { SortableHeader } from "~/internal/components/data-table";

/**
 * A sortable header over a right-aligned column (numbers, dates). The ghost
 * button carries 0.75rem of inline padding; the negative margin pulls it back so
 * the label lines up with the right-aligned cell text beneath it.
 */
export function RightAlignedSortableHeader<TData>({
  column,
  title,
}: {
  readonly column: Column<TData>;
  readonly title: string;
}) {
  return (
    <div className="-mr-3 flex justify-end">
      <SortableHeader column={column} title={title} />
    </div>
  );
}

/** A plain header over a right-aligned column. */
export function RightAlignedHeader({ title }: { readonly title: string }) {
  return <div className="text-right">{title}</div>;
}
