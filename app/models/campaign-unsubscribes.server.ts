import { inArray } from "drizzle-orm";
import { campaignUnsubscribes } from "~/db/schema";
import { chunk } from "~/lib/chunk";
import { normalizeEmail } from "~/ports/admin-users";
import type { CampaignUnsubscribes } from "~/ports/campaigns";
import { getDb } from "~/request-context.server";

/** The ONLY place `campaign_unsubscribes` is queried. Addresses are compared lower-cased and trimmed. */
export class CampaignUnsubscribeRepo implements CampaignUnsubscribes {
  async add(address: string, source: "link" | "staff", now: number): Promise<void> {
    await getDb()
      .insert(campaignUnsubscribes)
      .values({ address: normalizeEmail(address), unsubscribedAt: now, source })
      // The first request is the one on record; a repeat is the same person asking again.
      .onConflictDoNothing();
  }

  async among(addresses: readonly string[]): Promise<ReadonlySet<string>> {
    const wanted = [...new Set(addresses.map(normalizeEmail))];
    if (wanted.length === 0) return new Set();
    const found = new Set<string>();
    // D1 allows 100 bound parameters per statement, so a long list is asked in slices.
    for (const slice of chunk(wanted, 90)) {
      const rows = await getDb()
        .select({ address: campaignUnsubscribes.address })
        .from(campaignUnsubscribes)
        .where(inArray(campaignUnsubscribes.address, slice));
      for (const row of rows) found.add(row.address);
    }
    return found;
  }
}
