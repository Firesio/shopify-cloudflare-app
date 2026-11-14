import type { ShopIdentityFacts, ShopsPort } from "./ports";
import { recordInstall, type LifecycleDeps } from "./lifecycle";

/** What Shopify says about a shop, read with the shop's own offline token. Each read is its own failure: a value or `null`. */
export interface ShopFactsPort {
  identity(shop: string, accessToken: string): Promise<ShopIdentityFacts | null>;
  /** IANA zone and whether it is a development store; `null` when Shopify did not answer. */
  settings(shop: string, accessToken: string): Promise<{ readonly timeZone: string; readonly isDevStore: boolean } | null>;
}

export interface AfterAuthDeps extends LifecycleDeps {
  readonly shops: ShopsPort;
  readonly facts: ShopFactsPort;
  readonly now: () => number;
  /** Lifts a redaction tombstone: the merchant installing again is the one signal the shop is wanted back. */
  readonly clearRedaction: (shop: string) => Promise<boolean>;
  /** The Partner subscription read, after the response. */
  readonly refreshSubscription: (shop: { readonly domain: string; readonly shopifyShopId: string | null }) => Promise<unknown>;
  /** Hand work to run after the response (`waitUntil`); it is awaited where there is no request (cron, tests). */
  readonly afterResponse: (task: Promise<void>) => void;
}

export interface AuthenticatedSession {
  readonly shop: string;
  readonly accessToken?: string | undefined;
}

async function decorate(deps: AfterAuthDeps, session: AuthenticatedSession, token: string): Promise<void> {
  const [identity, settings] = await Promise.all([deps.facts.identity(session.shop, token), deps.facts.settings(session.shop, token)]);
  if (identity !== null) await deps.shops.saveIdentity(session.shop, identity);
  if (settings !== null) {
    await deps.shops.saveTimeZone(session.shop, settings.timeZone);
    await deps.shops.saveDevStatus(session.shop, settings.isDevStore, deps.now());
  }
  await deps.refreshSubscription({ domain: session.shop, shopifyShopId: identity?.shopifyShopId ?? (await deps.shops.get(session.shop))?.shopifyShopId ?? null });
}

/**
 * The `afterAuth` hook: the ONLY place a `shops` row is created, because this app never runs the OAuth callback (token
 * exchange mints the session on the first embedded page load). The library calls it when it MINTS a session, about hourly
 * per shop. Awaited: the redaction fence and the install record (with its `shop.*` event, one D1 batch). Everything else is
 * decoration or is repaired elsewhere, so it runs after the response and a failure is logged, never thrown.
 */
export async function afterAuth(deps: AfterAuthDeps, session: AuthenticatedSession): Promise<void> {
  if (await deps.clearRedaction(session.shop)) deps.log({ event: "shop.redaction_cleared" });
  await recordInstall(deps, session.shop, deps.now());
  const token = session.accessToken;
  if (token === undefined || token === "") return;
  deps.afterResponse(decorate(deps, session, token).catch((error: unknown) => deps.log({ event: "shop.after_auth_background_failed", error: error instanceof Error ? error.name : "unknown" })));
}
