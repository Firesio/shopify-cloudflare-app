import type { ReactNode } from "react";
import { CardDescription, CardHeader, CardTitle } from "~/internal/components/ui/card";

/** The header of one of the editor's three steps: a number, what it is, and one line saying what to do. */
export function StepHeader({ number, title, description }: { readonly number: number; readonly title: string; readonly description: string }): ReactNode {
  return (
    <CardHeader>
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          {number}
        </span>
        <div className="flex flex-col gap-1">
          <CardTitle>{`Step ${number}: ${title}`}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
    </CardHeader>
  );
}
