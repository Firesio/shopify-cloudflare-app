// After a refused save, take the merchant to the first thing that is wrong (Shopify's "Migrate InlineError" guidance:
// keep the values, "focus the first invalid field or summary"). Read in polaris.js (2026-10-19):
// - every field reflects `error` to an attribute, so the field is found by `[error]`;
// - every component host is `display: contents`, so the host itself has no box and `scrollIntoView` on it does nothing;
// - text, number, money, text area, date and select fields delegate focus: focusing the host focuses its input, and
//   the browser scrolls that input into view. A choice list and a drop zone do not.

/** The fields that delegate focus to their input. */
const DELEGATES_FOCUS: ReadonlySet<string> = new Set([
  "S-TEXT-FIELD",
  "S-NUMBER-FIELD",
  "S-MONEY-FIELD",
  "S-TEXT-AREA",
  "S-DATE-FIELD",
  "S-SELECT",
  "S-EMAIL-FIELD",
  "S-URL-FIELD",
  "S-PASSWORD-FIELD",
  "S-SEARCH-FIELD",
  "S-COLOR-FIELD",
]);

/** A field with an error, or an error drawn as text (`data-field-error`), whichever comes first in the page. */
export function firstErrorTarget(root: Element): Element | null {
  return root.querySelector('[error]:not([error=""]), [data-field-error]');
}

export type Revealed = "field" | "banner" | "none";

/**
 * Scrolls to and focuses the first error under `root`; with none, goes to the top of the page and focuses the critical
 * banner that says what happened.
 */
export function revealFirstError(
  root: Element,
  options: { readonly reducedMotion: boolean },
): Revealed {
  const behavior = options.reducedMotion ? "auto" : "smooth";
  const target = firstErrorTarget(root);
  if (target !== null) {
    revealField(target, behavior);
    return "field";
  }
  globalThis.scrollTo({ top: 0, behavior });
  const banner = document.querySelector('s-banner[tone="critical"]');
  if (!(banner instanceof HTMLElement)) return "none";
  banner.setAttribute("tabindex", "-1");
  banner.focus({ preventScroll: true });
  return "banner";
}

function revealField(target: Element, behavior: ScrollBehavior): void {
  if (DELEGATES_FOCUS.has(target.tagName) && target instanceof HTMLElement) {
    target.focus();
    return;
  }
  const choice =
    target.tagName === "S-CHOICE-LIST"
      ? target.querySelector("s-choice")
      : null;
  if (choice instanceof HTMLElement) {
    choice.focus();
    return;
  }
  firstBox(target)?.scrollIntoView({ block: "center", behavior });
}

/** The first element at or under `element` that has a box, looking through open shadow roots. */
function firstBox(element: Element): Element | null {
  if (element.getClientRects().length > 0) return element;
  const children = [
    ...Array.from(element.shadowRoot?.children ?? []),
    ...Array.from(element.children),
  ];
  for (const child of children) {
    const found = firstBox(child);
    if (found !== null) return found;
  }
  return null;
}
