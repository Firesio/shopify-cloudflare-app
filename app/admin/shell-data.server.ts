import { UTC } from "~/i18n/time-zone";
import type { ShopLogFields } from "~/observability/shop-log";

/** How long the shell waits on Shopify for a value that only decorates it (the stored identity, the shop's zone). */
export const SHELL_DECORATION_TIMEOUT_MS = 3_000;

/** The slice of the Admin client the shell's two lookups use, with the signal the library passes through. */
export interface AbortableAdmin {
  readonly graphql: (query: string, options: { readonly signal: AbortSignal }) => Promise<Response>;
}

/** The same client, narrowed to what `persistShopIdentity` / `shopTimeZone` accept, with every call tied to `signal`. */
export function boundAdmin(admin: AbortableAdmin, signal: AbortSignal): { graphql: (query: string) => Promise<Response> } {
  return { graphql: (query) => admin.graphql(query, { signal }) };
}

export interface ShellDecorationPorts {
  /** Writes the shop's identity through on the first visit; a refused answer is a status, not a throw. */
  readonly persistIdentity: (signal: AbortSignal) => Promise<{ readonly status: string }>;
  /** The shop's zone: stored, else asked of Shopify and stored. */
  readonly timeZone: (signal: AbortSignal) => Promise<string>;
  readonly log: (event: string, shop: string, fields?: ShopLogFields) => Promise<void>;
  readonly timeoutMs?: number;
}

type Bounded<T> =
  | { readonly kind: "done"; readonly value: T }
  | { readonly kind: "timeout" }
  | { readonly kind: "error"; readonly errorName: string };

/** Runs `work` for at most `timeoutMs`; the signal lets a real request stop, and the race covers work that ignores it. */
async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<Bounded<T>> {
  const signal = AbortSignal.timeout(timeoutMs);
  const expired = new Promise<Bounded<T>>((resolve) => {
    signal.addEventListener("abort", () => resolve({ kind: "timeout" }), { once: true });
  });
  const running = work(signal).then(
    (value): Bounded<T> => ({ kind: "done", value }),
    (error: unknown): Bounded<T> => ({ kind: "error", errorName: error instanceof Error ? error.name : typeof error }),
  );
  return Promise.race([running, expired]);
}

/**
 * Everything the app shell wants from Shopify that is DECORATION: the stored identity and the shop's zone. Neither may
 * cost the merchant the page. Each is bounded; a timeout, a throw or a refusal is logged with a stable event and the
 * shop, and the shell carries on (the zone falls back to UTC, which server and browser both render the same way).
 * Authentication is NOT here: it stays awaited in the loader, because a page without it must not render.
 */
export async function loadShellDecoration(shop: string, ports: ShellDecorationPorts): Promise<{ readonly timeZone: string }> {
  const timeoutMs = ports.timeoutMs ?? SHELL_DECORATION_TIMEOUT_MS;
  const [identity, zone] = await Promise.all([bounded(ports.persistIdentity, timeoutMs), bounded(ports.timeZone, timeoutMs)]);

  if (identity.kind === "timeout") await ports.log("shell.identity_unavailable", shop, { reason: "timeout" });
  else if (identity.kind === "error") await ports.log("shell.identity_unavailable", shop, { reason: "error", errorName: identity.errorName });
  else if (identity.value.status !== "recorded") await ports.log("shell.identity_unavailable", shop, { reason: "refused" });

  if (zone.kind === "done") return { timeZone: zone.value };
  await ports.log("shell.time_zone_unavailable", shop, zone.kind === "timeout" ? { reason: "timeout" } : { reason: "error", errorName: zone.errorName });
  return { timeZone: UTC };
}
