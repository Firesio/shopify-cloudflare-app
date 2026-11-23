# Languages

One list: the folders of `app/i18n/locales/` (plus the fallback). Nothing else lists the languages; adding one is adding its folder (`language.json` and one JSON per namespace, the same keys as `en`) and translating. The rest is derived. Design: `platform` ticket 39.

## Public pages

- The language is the address's: the default language keeps the plain address (`/support`), any other has its folder in front (`/es/support`). `routes.ts` wraps every public page in `route(":language?", "routes/public/layout.tsx", [...])`; the layout's loader calls `firesio.publicLanguage` (404 for a folder that is no language, 301 from `/en/...`, and at `/` alone the visitor's language, from the language they chose in the switch or `Accept-Language`).
- A page's words are read in `firesio.addressLanguage(request)`, never `localeIn(i18n)(request)` (which reads cookie and header and is for the embedded admin).
- A page's head: `languageMetaOf(matches)` (canonical, `hreflang` for every language and `x-default`, `og:locale`). A content page (the blog) uses `cmsMeta`: its alternates are the translations that exist.
- Links inside a page: `const to = useLanguagePath(); <Link to={to("/support")}>`.
- The switch is `LanguageSwitcher` (links to `/language/es?next=...`, route `routes/public/language.ts`).
- A new public page: add its route under the `:language?` layout, add its path to `PUBLIC_PATHS` in `app/core/seo.ts` (the sitemap), and give it `meta` with `languageMetaOf(matches)`.
- `<html lang dir>` comes from the matched public layout (`useHtmlLanguage` in `root.tsx`); anywhere else it is the request's language.

## The blog

A collection that names no `locales` is written in every language of the app. A post in Spanish is a second entry (the portal's Content page has a Language field and "translation of"); `/es/blogs/<slug>` is 404 until it is published, so nothing is served twice. Sitemaps: `/sitemap.xml` is the index of `/sitemap-pages.xml` and `/sitemap-content.xml`.
