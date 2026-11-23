/**
 * The app's own indexable pages (no language folder: the preset writes each in every language of the app, `firesio.pagesSitemap`). A page that is added to
 * `routes.ts` for the public is listed here, or search engines never hear of it. The staff and shopper pages are not public and stay out.
 */
export const PUBLIC_PATHS = ["/", "/support", "/legal/privacy", "/legal/terms"] as const;
