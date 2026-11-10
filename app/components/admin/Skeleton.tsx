import type { ComponentProps } from "react";

/**
 * Skeleton pieces for the embedded admin (OWNER DECISION, see `.claude/rules/polaris-app-home.md`, "Loading": Polaris
 * has no skeleton, the owner wants one anyway so a pending page keeps the exact footprint of the loaded one).
 *
 * The rule that makes them safe: a skeleton replaces ONLY a data-dependent value, inside the REAL component. Render the
 * loaded markup with a `loading` flag and swap each value for one of these, so the pending and the loaded page cannot
 * drift apart. Heights are never written as pixels: the bar is a real `s-text` / `s-heading` / `s-badge` holding
 * figure-space characters (non-breaking and as wide as a digit), so its height is the real line height at that size and
 * its width is `chars` digits. Only `SkeletonBlock` takes pixels, for an image or avatar whose size is fixed anyway.
 *
 * `data-skeleton` is what `app/styles/admin/skeleton.css` animates. Every bar is hidden from assistive technology;
 * ONE `SkeletonStatus` per pending region announces the wait.
 */
const FIGURE_SPACE = " ";
const figures = (chars: number) => FIGURE_SPACE.repeat(Math.max(1, Math.round(chars)));

type TextLook = Pick<ComponentProps<"s-text">, "fontSize" | "fontWeight" | "type">;

/** A value that is text or a number: `chars` is roughly how many characters the loaded value has. Sits inline. */
export function SkeletonText({ chars = 12, heading = false, ...look }: TextLook & { readonly chars?: number; readonly heading?: boolean }) {
  return (
    <s-stack direction="inline" accessibilityVisibility="hidden">
      <s-box data-skeleton="" background="strong" borderRadius="small-100">
        {heading ? <s-heading>{figures(chars)}</s-heading> : <s-text {...look}>{figures(chars)}</s-text>}
      </s-box>
    </s-stack>
  );
}

/** A paragraph that is still loading: `lines` full-width lines, the last one shorter. */
export function SkeletonLines({ lines = 3 }: { readonly lines?: number }) {
  const count = Math.max(1, Math.round(lines));
  return (
    <s-stack direction="block" gap="none" accessibilityVisibility="hidden">
      {Array.from({ length: count }, (_, index) => (
        <s-box key={index} data-skeleton="" background="strong" borderRadius="small-100" inlineSize={index === count - 1 && count > 1 ? "60%" : "auto"}>
          <s-text>{figures(1)}</s-text>
        </s-box>
      ))}
    </s-stack>
  );
}

/** A real, neutral `s-badge` with an invisible label: a pending status or trend, with the badge's own height and shape. */
export function SkeletonBadge({ chars = 5 }: { readonly chars?: number }) {
  return (
    <s-stack direction="inline" accessibilityVisibility="hidden">
      <s-badge data-skeleton="" tone="neutral">{figures(chars)}</s-badge>
    </s-stack>
  );
}

/** An image, thumbnail or avatar that is still loading, at the size it will have (pixels, because that size is fixed). */
export function SkeletonBlock({ width, height }: { readonly width: number; readonly height: number }) {
  return <s-box data-skeleton="" background="strong" borderRadius="base" inlineSize={`${width}px`} blockSize={`${height}px`} accessibilityVisibility="hidden" />;
}

/** The ONE announcement for a pending region ("Loading plans"): visually hidden, read out by a screen reader. */
export function SkeletonStatus({ label }: { readonly label: string }) {
  return (
    <s-box accessibilityRole="status">
      <s-text accessibilityVisibility="exclusive">{label}</s-text>
    </s-box>
  );
}
