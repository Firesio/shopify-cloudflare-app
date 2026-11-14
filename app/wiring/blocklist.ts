import { createBlocklistReader } from "@firesio/portal-client";
import { createHasher } from "@firesio/portal-contract";
import { createBlocklist, type Blocklist } from "~/core/blocklist";

/** The portal's blocklist and kill switch, read from the `PORTAL_BLOCKLIST` KV (the portal writes it; read-only here). */
export function blocklistFor(env: Env): Blocklist {
  return createBlocklist({
    hasher: async () => {
      if (env.EVENT_HASH_SECRET === "" || env.EVENT_HASH_KEY_ID === "") return null;
      const made = await createHasher(env.EVENT_HASH_SECRET, env.EVENT_HASH_KEY_ID);
      return made.ok ? made.value : null;
    },
    reader: (failMode, hasher) => createBlocklistReader(env.PORTAL_BLOCKLIST, { failMode, ...(hasher === null ? {} : { hashKeyId: hasher.keyId }) }),
  });
}
