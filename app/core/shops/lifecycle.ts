import type { Emitter, PortalMessage } from "@firesio/portal-client";
import type { AccountRef } from "@firesio/portal-contract";
import type { ShopsPort } from "./ports";

export interface LifecycleDeps {
  readonly shops: ShopsPort;
  readonly portal: Emitter;
  readonly log: (entry: Readonly<Record<string, unknown>>) => void;
}

/** The contract allows letters, digits, `_` and `-` in an event id: a shop domain's dots become underscores (a domain never has one, so the mapping is one to one). */
export const idPart = (value: string): string => value.replace(/[^A-Za-z0-9_-]/g, "_");

export const accountOf = (shop: string): AccountRef => ({ kind: "shopify_shop", id: shop });

/** What a shop that just got a session is: nothing on record, an uninstalled one coming back, or a renewal of the same token. */
export type InstallKind = "installed" | "reinstalled" | "renewal";

export function installKindOf(existing: { readonly relationshipStatus: string | null; readonly uninstalledAt?: number | null } | null): InstallKind {
  if (existing === null) return "installed";
  return existing.relationshipStatus === "UNINSTALLED" ? "reinstalled" : "renewal";
}

async function eventFor(deps: LifecycleDeps, kind: InstallKind, shop: string, at: number): Promise<PortalMessage | null> {
  if (kind === "renewal") return null;
  const build = kind === "installed" ? deps.portal.build.shopInstalled : deps.portal.build.shopReinstalled;
  const eventId = kind === "installed" ? `install_${idPart(shop)}` : `reinstall_${idPart(shop)}_${at}`;
  const built = await build(accountOf(shop), { eventId, occurredAt: new Date(at) });
  if (!built.ok) {
    // A bug in our code, never the merchant's problem: the install itself goes ahead.
    deps.log({ event: "portal.event_invalid", type: kind, reason: built.reason });
    return null;
  }
  return built.value;
}

/**
 * Record the install the moment a shop gets a session (the `afterAuth` hook: this app never runs the OAuth callback, token
 * exchange mints the session on the first embedded page load). The shop row and the `shop.installed` / `shop.reinstalled`
 * event are one D1 batch. A renewal of an expiring offline token (about hourly) writes the stamp and no event.
 */
export async function recordInstall(deps: LifecycleDeps, shop: string, at: number): Promise<InstallKind> {
  const kind = installKindOf(await deps.shops.get(shop));
  await deps.shops.recordInstall({ shop, at, event: await eventFor(deps, kind, shop, at) });
  return kind;
}

/** The uninstall webhook: the row and the `shop.uninstalled` event in one batch, only when the uninstall was applied. */
export async function recordUninstall(deps: LifecycleDeps, input: { readonly shop: string; readonly webhookId: string; readonly occurredAt: number }): Promise<"applied" | "stale" | "unknown_shop"> {
  const built = await deps.portal.build.shopUninstalled(accountOf(input.shop), undefined, { eventId: `uninstall_${idPart(input.webhookId)}`, occurredAt: new Date(input.occurredAt) });
  if (!built.ok) deps.log({ event: "portal.event_invalid", type: "shop.uninstalled", reason: built.reason });
  return deps.shops.recordUninstall({ shop: input.shop, occurredAt: input.occurredAt, event: built.ok ? built.value : null });
}
