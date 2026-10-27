// What an app can plug in later without touching a renderer. Interfaces plus the do-nothing defaults. Generic over the
// language type, so the app's closed union of shipped languages is what flows through, not a bare string.

/** One stored piece of the app's own text (a ticket title, a service name) that a reader may see in a language. */
export interface ContentRef {
  /** What kind of thing it is, e.g. "service". */
  readonly kind: string;
  readonly id: string;
  /** Which of its fields, e.g. "name". */
  readonly field: string;
  /** The text as the merchant wrote it. Returned unchanged when no translation exists. */
  readonly original: string;
}

/**
 * Translates the app's OWN stored text for a reader, one piece at a time: the answer is always exactly the text asked
 * for, so there is no list to index and no "missing" case. An implementation that wants one query per render batches
 * inside itself (a per-request memo). The default returns the original.
 */
export interface ContentLocalizer<L extends string> {
  localize(ref: ContentRef, language: L): Promise<string>;
}

export function identityContentLocalizer<L extends string>(): ContentLocalizer<L> {
  return { localize: (ref) => Promise.resolve(ref.original) };
}

/** What the app knows about a shop's languages, already narrowed to languages the app can serve. */
export interface ShopLanguageFacts<L extends string> {
  /** The shop's primary language, or null when the app does not know it. */
  readonly primary: L | null;
  /** The languages an end customer of this shop may be shown. */
  readonly available: readonly L[];
}

export interface ShopLanguages<L extends string> {
  forShop(shop: string | undefined): Promise<ShopLanguageFacts<L>>;
}

/**
 * The template's provider: the shop's primary language is unknown (the template stores none and asks for no
 * `read_locales` scope), and the languages on offer are the shipped catalogues.
 */
export function shippedShopLanguages<L extends string>(shipped: readonly L[]): ShopLanguages<L> {
  return { forShop: () => Promise.resolve({ primary: null, available: shipped }) };
}
