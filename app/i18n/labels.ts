import type { Translator } from "@firesio/app/i18n";

/**
 * The words of the app's own pages as plain-string objects, built from the catalogue (`locales/<language>/app.json`) in a loader and handed to a component as
 * props, so a component never reads the catalogue and a test hands it any words. The package's pages do the same (`membersLabelsOf(t, ...)`, `plansLabelsOf(t, ...)`).
 */
type Words = Pick<Translator, "t">;

export interface NavLabels {
  readonly home: string;
  readonly support: string;
  readonly plan: string;
  readonly team: string;
  readonly settings: string;
  /** The staff phone app's own page (only while `PWA` is on). */
  readonly phones: string;
}

export function navLabelsOf({ t }: Words): NavLabels {
  return { home: t("nav.home"), support: t("nav.support"), plan: t("nav.plan"), team: t("nav.team"), settings: t("nav.settings"), phones: t("nav.phones") };
}

export interface PublicNavLabels {
  readonly support: string;
  readonly privacy: string;
  readonly terms: string;
  readonly language: string;
  readonly skip: string;
  readonly main: string;
}

/** The words around every public page (header, footer, the language switch), in the language of the address. */
export function publicNavLabelsOf({ t }: Words): PublicNavLabels {
  return { support: t("nav.support"), privacy: t("nav.privacy"), terms: t("nav.terms"), language: t("nav.language"), skip: t("nav.skip"), main: t("nav.main") };
}

export interface HomeLabels {
  readonly placeholderHeading: string;
  readonly placeholder: string;
  readonly storeHeading: string;
  readonly store: string;
  readonly plan: string;
  readonly access: string;
  readonly contactSupport: string;
}

/** The home page's words with the values of this request filled in (the shop, its plan's name, what the member holds). */
export function homeLabelsOf({ t }: Words, values: { readonly shop: string; readonly plan: string; readonly permissions: readonly string[] }): HomeLabels {
  return {
    placeholderHeading: t("home.placeholderHeading"),
    placeholder: t("home.placeholder"),
    storeHeading: t("home.storeHeading"),
    store: t("home.store", { shop: values.shop }),
    plan: t("home.plan", { plan: values.plan }),
    access: t("home.access", { permissions: values.permissions.join(", ") }),
    contactSupport: t("home.contactSupport"),
  };
}

export interface BlogLabels {
  readonly heading: string;
  readonly description: string;
  readonly more: string;
  readonly empty: string;
  readonly back: string;
}

/** The blog pages' words (`blog.*`): the list's heading, its description for search engines, the next-page link, the empty state, the way back. */
export function blogLabelsOf({ t }: Words, values: { readonly app: string }): BlogLabels {
  return { heading: t("blog.heading"), description: t("blog.description", { app: values.app }), more: t("blog.more"), empty: t("blog.empty"), back: t("blog.back") };
}
