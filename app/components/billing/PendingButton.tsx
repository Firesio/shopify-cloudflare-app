/** Figure space (U+2007): as wide as a digit and not collapsed, so `chars` of them hold a label's width. */
const FIGURE_SPACE = " ";

/**
 * The page's main button while what it says or where it goes is not known yet: the REAL primary `s-button`, disabled,
 * with an invisible label of `chars` characters and the skeleton marker, so it has the loaded button's height and width.
 * Same recipe as `SkeletonBadge` (a real component, masked by `app/styles/admin/skeleton.css`). It is not `loading`:
 * that spinner is for an action the merchant started. Hidden from assistive technology; the region's one
 * `SkeletonStatus` announces the wait.
 *
 * Lives here, not in `components/admin/Skeleton.tsx`, because the owner asked for no new shared primitives; if a second
 * page needs a pending button, move it there.
 */
export function PendingButton({ chars }: { readonly chars: number }) {
  return (
    <s-stack direction="inline" accessibilityVisibility="hidden">
      <s-button data-skeleton="" variant="primary" disabled>
        {FIGURE_SPACE.repeat(Math.max(1, Math.round(chars)))}
      </s-button>
    </s-stack>
  );
}
