import { index, layout, prefix, route, type RouteConfig } from "@react-router/dev/routes";
import { PWA } from "./core/features";
import { phoneAppRoutes, phonePublicRoutes } from "./routes/phone-routes";

/**
 * Explicit route config, NOT flat file-name routing: the URL structure lives here and the file tree mirrors it.
 * One surface per top-level group. The merchant pages of `@firesio/app` (`ui/*`) are two-line files under `routes/app/`
 * that re-export a library route module.
 */
export default [
  // Public surface: marketing, legal, support. No authentication (the App Store listing links straight to /legal/privacy).
  layout("routes/public/layout.tsx", [
    index("routes/public/landing.tsx"),
    route("support", "routes/public/support.tsx"),
    ...prefix("legal", [route("privacy", "routes/public/legal/privacy.tsx"), route("terms", "routes/public/legal/terms.tsx")]),
    // The unsubscribe link of a mail sent on consent (`firesio.unsubscribe`, RFC 8058 one-click): public, signed, no shop.
    route("unsubscribe", "routes/public/unsubscribe.tsx"),
    // The app's blog (`app/cms`): written from the portal, served here for search engines. A static segment outranks `:slug`, so `rss.xml` is never a post.
    ...prefix("blogs", [index("routes/public/blogs/index.tsx"), route(":slug", "routes/public/blogs/post.tsx")]),
  ]),
  // The content's resource routes: the feed, the sitemap of every collection, the uploaded images.
  route("blogs/rss.xml", "routes/public/blogs/rss.ts"),
  route("sitemap.xml", "routes/public/sitemap.ts"),
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
