import { Suspense, type ReactNode } from "react";
import { Await } from "react-router";

import type { Outcome } from "~/admin/outcome";
import { SkeletonLines, SkeletonStatus } from "./Skeleton";

type DeferredProps<T> = {
  /** A loader region already passed through `settle()`. */
  readonly resolve: Promise<Outcome<T>>;
  /** Shown while the region is pending. */
  readonly pending: ReactNode;
  /** Shown when the region failed, on the server (`ok: false`) or in transit (stream timeout). */
  readonly failed: ReactNode;
  readonly children: (value: T) => ReactNode;
};

/**
 * One streamed region of a page: pending UI, then the value, or the failure.
 *
 * `errorElement` covers the one rejection `settle()` cannot prevent: the
 * loader stream is cut off by `streamTimeout`, which rejects every promise
 * still pending in the browser. The merchant sees the same failure UI either way.
 *
 * Renders no wrapper element, so `s-section` children stay direct children of
 * `s-page`, which is what lets the page space them.
 */
export function Deferred<T>({ resolve, pending, failed, children }: DeferredProps<T>) {
  return (
    <Suspense fallback={pending}>
      <Await resolve={resolve} errorElement={failed}>
        {(outcome) => (outcome.ok ? children(outcome.value) : failed)}
      </Await>
    </Suspense>
  );
}

type PendingSectionProps = {
  /** Translated name of what is loading ("Loading plans"); announced once to assistive technology. */
  readonly label: string;
  /** The section's real heading, shown at once. */
  readonly heading?: string;
  /**
   * The section's real static parts with skeletons where the data goes. Best produced by rendering the loaded
   * component with its `loading` flag, so the two cannot differ. Omitted: three skeleton lines.
   */
  readonly children?: ReactNode;
};

/**
 * Loading UI for one pending region (OWNER DECISION, `.claude/rules/polaris-app-home.md`, "Loading"): the real
 * `s-section` and heading, the static children, skeletons where the data goes, and one hidden status for screen
 * readers. No spinner: a button shows its own `loading`, and a navigation uses `shopify.loading`.
 */
export function PendingSection({ label, heading, children }: PendingSectionProps) {
  return (
    <s-section heading={heading} accessibilityLabel={label}>
      {children ?? <SkeletonLines lines={3} />}
      <SkeletonStatus label={label} />
    </s-section>
  );
}

type FailedSectionProps = {
  readonly heading: string;
  readonly body: string;
};

/** The region's failure, in place of the value it could not show. The rest of the page is untouched. */
export function FailedSection({ heading, body }: FailedSectionProps) {
  return (
    <s-section>
      <s-banner tone="critical" heading={heading}>
        <s-paragraph>{body}</s-paragraph>
      </s-banner>
    </s-section>
  );
}
