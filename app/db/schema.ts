/**
 * The tables THIS app owns, and only those. The shared ones (`shops`, `shop_subscriptions`, `shop_plan_grants`,
 * `notification_preferences`) and every library's tables come from `@firesio/app` (`drizzle.config.ts` lists their schema
 * files next to this one, so `npm run db:generate` sees the whole database and writes ONE migration history in `./drizzle`).
 *
 * `app/firesio.server.ts` hands this module to the preset, which erases every table here that has a `shop` column on
 * `shop/redact`. A table keyed by another column goes in `purge.shopScoped`; one that must survive a redaction goes in
 * `purge.keep`, with the reason.
 *
 * The template has no table of its own yet: a derived app adds its tables here.
 */
export {};
