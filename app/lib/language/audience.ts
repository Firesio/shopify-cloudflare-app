// What an app can plug in later without touching a renderer. Interfaces plus the do-nothing defaults.
import type { LanguageTag } from "./tag";

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

/** Translates the app's OWN stored text for a reader. The default returns the originals. */
export interface ContentLocalizer {
  /** One string per ref, in order. A ref with no translation yields its `original`. */
  localize(refs: readonly ContentRef[], language: LanguageTag): Promise<readonly string[]>;
}

export const identityContentLocalizer: ContentLocalizer = {
  localize: (refs) => Promise.resolve(refs.map((ref) => ref.original)),
};

/** What the app knows about a shop's languages. */
export interface ShopLanguageFacts {
  /** The shop's primary language, or null when the app does not know it. */
  readonly primary: string | null;
  /** The languages an end customer of this shop may be shown. */
  readonly available: readonly string[];
}

export interface ShopLanguages {
  forShop(shop: string | undefined): Promise<ShopLanguageFacts>;
}

/**
 * The template's provider: the shop's primary language is unknown (the template stores none and asks for no
 * `read_locales` scope), and the languages on offer are the shipped catalogues.
 */
export function shippedShopLanguages(shipped: readonly string[]): ShopLanguages {
  return { forShop: () => Promise.resolve({ primary: null, available: shipped }) };
}
