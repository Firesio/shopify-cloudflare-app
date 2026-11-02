import type { ReactNode } from "react";
import type { AudiencePreview } from "~/domain/campaign-audience";
import { formatNumber } from "~/i18n/format";

const count = (value: number) => formatNumber("en", value);

/**
 * Who an announcement would reach, as a sum a person can check: the shops that match, minus the ones it cannot or must
 * not go to, is who receives it. `sample` puts a few real names to the number.
 */
export function PreviewCard({ label, preview, caption, action }: { readonly label: string; readonly preview: AudiencePreview; readonly caption: string; readonly action?: ReactNode }) {
  return (
    <section aria-label={label} className="flex flex-col gap-4 rounded-lg border bg-muted/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div aria-live="polite">
          <p className="text-3xl font-semibold tabular-nums">{count(preview.recipients)}</p>
          <p className="text-sm text-muted-foreground">{`${preview.recipients === 1 ? "shop" : "shops"} will receive it`}</p>
        </div>
        {action}
      </div>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <Figure label="Shops that match" value={preview.matched} />
        <Figure label="Without an email address" value={preview.withoutAddress} />
        <Figure label="Unsubscribed" value={preview.unsubscribed} />
      </dl>
      {preview.sample.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">For example</p>
          <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
            {preview.sample.map((entry) => (
              <li key={entry.shop}>
                <span className="text-foreground">{entry.name}</span>
                {` · ${entry.email}`}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{caption}</p>
    </section>
  );
}

function Figure({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded-md bg-background px-3 py-2 sm:flex-col sm:items-start sm:gap-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{count(value)}</dd>
    </div>
  );
}
