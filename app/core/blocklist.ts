import type { BlocklistReader } from "@firesio/portal-client";
import type { Hasher } from "@firesio/portal-contract";

/** The shop as the portal names an account. */
const accountOf = (shop: string) => ({ kind: "shopify_shop" as const, id: shop });

export interface Blocklist {
  /**
   * The portal's KILL SWITCH for one shop. Fails OPEN: a KV outage must not lock real merchants out of the app (the cost of a wrong
   * pass here is a day of use, the cost of a wrong block is a merchant who cannot reach us).
   */
  shopBlocked(shop: string): Promise<boolean>;
  /**
   * May a mail go to this address for this shop? Fails CLOSED (the reader's default): a KV outage must not let scam mail out; the mail is
   * held back (the caller logs it) until KV answers. Blocked: the recipient, or the shop.
   */
  mailBlocked(shop: string, to: string): Promise<boolean>;
}

export interface BlocklistDeps {
  /** Built per call with the shared key: `createHasher(EVENT_HASH_SECRET, EVENT_HASH_KEY_ID)`; absent when the key is not configured. */
  readonly hasher: () => Promise<Hasher | null>;
  /** One reader per fail mode: a reader's mode is fixed at creation. */
  readonly reader: (failMode: "open" | "closed", hasher: Hasher | null) => BlocklistReader;
}

export function createBlocklist(deps: BlocklistDeps): Blocklist {
  return {
    async shopBlocked(shop) {
      return (await deps.reader("open", null).isAccountBlocked(accountOf(shop), { failMode: "open" })).blocked;
    },
    async mailBlocked(shop, to) {
      const hasher = await deps.hasher();
      const reader = deps.reader("closed", hasher);
      if ((await reader.isAccountBlocked(accountOf(shop))).blocked) return true;
      // Without the shared key the recipient cannot be checked (a hash is the key): say so in the log, never block every mail for it.
      return hasher === null ? false : (await reader.isRecipientBlocked(await hasher.hashEmail(to))).blocked;
    },
  };
}
