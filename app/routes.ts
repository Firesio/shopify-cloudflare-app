import { index, prefix, route, type RouteConfig } from "@react-router/dev/routes";
import { PWA } from "./core/features";
import { phoneAppRoutes, phonePublicRoutes } from "./routes/phone-routes";

/**
 * Explicit route config, NOT flat file-name routing: the URL structure lives here and the file tree mirrors it.
 * One surface per top-level group. The merchant pages of `@firesio/app` (`ui/*`) are two-line files under `routes/app/`
 * that re-export a library route module.
 */
export default [
  // Public surface: marketing, legal, support. No authentication (the App Store listing links straight to /legal/privacy).
  // `:language?` is the language folder (`/es/pricing`; none for the default language): ONE rule for every public page, read from the address by the layout's loader
  // (`firesio.publicLanguage`, docs/LANGUAGES.md). A folder that is no language of the app is the public 404.
  route(":language?", "routes/public/layout.tsx", [
    index("routes/public/landing.tsx"),
    route("support", "routes/public/support.tsx"),
    ...prefix("legal", [route("privacy", "routes/public/legal/privacy.tsx"), route("terms", "routes/public/legal/terms.tsx")]),
    // The unsubscribe link of a mail sent on consent (`firesio.unsubscribe`, RFC 8058 one-click): public, signed, no shop.
    route("unsubscribe", "routes/public/unsubscribe.tsx"),
    // The app's blog (`app/cms`): written from the portal, served here for search engines. A static segment outranks `:slug`, so `rss.xml` is never a post.
    ...prefix("blogs", [index("routes/public/blogs/index.tsx"), route(":slug", "routes/public/blogs/post.tsx")]),
  ]),
  // The language switch (`/language/es?next=/support`: remembers the choice, goes to the page in that language), the feed of each language, the sitemaps and the uploaded images.
  route("language/:language", "routes/public/language.ts"),
  route(":language?/blogs/rss.xml", "routes/public/blogs/rss.ts"),
  route("sitemap.xml", "routes/public/sitemap.ts"),
  route("sitemap-pages.xml", "routes/public/sitemap-pages.ts"),
  route("sitemap-content.xml", "routes/public/sitemap-content.ts"),
  route("cms/media/:key", "routes/public/cms/media.ts"),

  // Embedded Shopify admin: everything under /app runs inside the Shopify admin iframe.
  route("app", "routes/app/layout.tsx", [
    index("routes/app/home.tsx"),
    route("support", "routes/app/support/list.tsx"),
    route("support/new", "routes/app/support/new.tsx"),
    // The file staging route of the support pages (`paths.supportUpload`): a resource route, no page. A static segment outranks
    // `:ticketId`, so `upload` is never read as a ticket id.
    route("support/upload", "routes/app/support/upload.ts"),
    route("support/:ticketId", "routes/app/support/thread.tsx"),
    route("members", "routes/app/members/team.tsx"),
    route("members/:memberId", "routes/app/members/member.tsx"),
    route("no-access", "routes/app/members/no-access.tsx"),
    // The blocked-shop page and the ask-to-be-let-in action: mounted together with `paths.blocked` and `paths.requestAccess` (`app/firesio.server.ts`); `app/routes.test.ts` holds the pairs.
    route("blocked", "routes/app/blocked.tsx"),
    route("request-access", "routes/app/request-access.ts"),
    // Where the page reports the surface it runs on (the Shopify POS webview); `app/surface.test.ts` holds this line.
    route("surface", "routes/app/surface.ts"),
    // The member's own page about their phones: only while the staff phone app is on (`app/core/features.ts`).
    ...(PWA ? phoneAppRoutes : []),
    route("plans", "routes/app/plans.tsx"),
    route("settings", "routes/app/settings.tsx"),
    route("settings/history", "routes/app/settings-history.tsx"),
    route("*", "routes/app/not-found.tsx"),
  ]),

  // The staff phone app (`app/core/features.ts`, `docs/POS-AND-PHONE.md` section 3): its public pages, the manifest, the pairing calls and the service worker. Off by default.
  ...(PWA ? phonePublicRoutes : []),

  // One file of a support ticket, by its signed link (the pages, the portal and the mails carry it).
  route("support/file/:id", "routes/support/file.ts"),

  // OAuth: paths fixed by `authPathPrefix: "/auth"` and the redirect_urls in shopify.app*.toml. Do not rename.
  ...prefix("auth", [route("login", "routes/auth/login.tsx"), route("*", "routes/auth/callback.tsx")]),

  // Webhooks: URIs must match the subscriptions in BOTH shopify.app.toml files. One receiver for every topic.
  route("webhooks/*", "routes/webhooks/receive.ts"),

  route("healthz", "routes/healthz.ts"),
] satisfies RouteConfig;
