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

## Words for an extension

`app/i18n/words.ts` declares every namespace of `app/i18n/locales/<source>/` (`defineWords`: its audience, the places it goes, whether a merchant may overwrite it through `layers`) and `app/i18n/words.test.ts` holds that declaration to the catalogue (`describeI18nTargets` of `@firesio/app/i18n/testing`). A namespace with no declaration, or a declared one with no file, fails the test. The template has no extension with `locales/`, so its `targets` is empty.

To give a Shopify extension its `locales/` files (built from the same catalogue; there is no script to write):

1. Put the extension's words in their own namespace (`app/i18n/locales/<language>/pos.json`, or `block.json` and `block-schema.json` for a theme block) in every language, and declare each in `words.ts` with `targets: ["pos"]` (a name of `TARGETS`).
2. Add one line to `targets` in `words.test.ts`: `pos: uiExtension({ dir: "extensions/pos", groups: ["pos"] })` for a UI extension (`maxBytes` only if you measured a limit: Shopify documents none), or `theme: themeExtension({ dir: "extensions/theme", storefront: ["block"], schema: ["block-schema"] })` (15 KB a file and 100 files, reported as a problem, never worked around). Both come from `@firesio/app/i18n/build`.
3. Run `npx vitest -u app/i18n/words.test.ts`: it writes `<dir>/locales/<language>.json` and `<default>.default.json` (plural forms in Shopify's nested shape). A plain run fails while a generated file is stale, so a change to a word is a change of the extension's file in the same commit.

A namespace marked `editable` cannot go to an extension. Details: `node_modules/@firesio/app/src/i18n/README.md`, "Build targets".
