import { and, eq, gte, isNotNull, isNull, lt, notExists, sql, type SQL } from "drizzle-orm";
import { campaignUnsubscribes, shops } from "~/db/schema";
import { AUDIENCE_FILTER_KEYS, type AudienceFilter, type AudienceFilterKey, type AudiencePreview } from "~/domain/campaign-audience";
import { getDb } from "~/request-context.server";

/**
 * The ONLY place an audience filter becomes a query. One entry per filter key, so adding a filter is one entry here
 * (the compiler names it when missing) plus its words in `domain/campaign-audience.ts`.
 */
export const AUDIENCE_CONDITIONS: Readonly<Record<AudienceFilterKey, (filter: AudienceFilter) => SQL | undefined>> = {
  kind: (filter) => (filter.kind === "all" ? undefined : eq(shops.isDevStore, filter.kind === "dev")),
  installedAfter: (filter) => (filter.installedAfter === null ? undefined : gte(shops.installedAt, filter.installedAfter)),
  installedBefore: (filter) => (filter.installedBefore === null ? undefined : lt(shops.installedAt, filter.installedBefore)),
};

/** Where an announcement is addressed: the account owner's address, else the store's contact address; never blank. */
export const shopAddress = sql<string | null>`lower(coalesce(nullif(${shops.email}, ''), nullif(${shops.contactEmail}, '')))`;

/**
 * Shops that match the filter AND that nobody may switch off: the app is still installed. (An uninstalled shop has no
 * reason to read about an app it removed.)
 */
function matching(filter: AudienceFilter): SQL | undefined {
  return and(
    isNull(shops.uninstalledAt),
    ...AUDIENCE_FILTER_KEYS.map((key) => AUDIENCE_CONDITIONS[key](filter)),
  );
}

function notUnsubscribed(): SQL {
  const listed = getDb()
    .select({ one: sql`1` })
    .from(campaignUnsubscribes)
    .where(eq(campaignUnsubscribes.address, shopAddress));
  return notExists(listed);
}

/** Matching shops with an address that has not unsubscribed: exactly who receives it. */
export function receivers(filter: AudienceFilter): SQL | undefined {
  return and(matching(filter), isNotNull(shopAddress), notUnsubscribed());
}

const PREVIEW_SAMPLE = 5;

/** How many shops match, why some would not receive it, and a few who would. One batch, bounded by the shops table. */
export async function previewAudience(filter: AudienceFilter): Promise<AudiencePreview> {
  const db = getDb();
  const withAddress = and(matching(filter), isNotNull(shopAddress));
  const [matchedRows, withAddressRows, receiverRows, sample] = await db.batch([
    db.select({ n: sql<number>`count(*)` }).from(shops).where(matching(filter)),
    db.select({ n: sql<number>`count(*)` }).from(shops).where(withAddress),
    db.select({ n: sql<number>`count(*)` }).from(shops).where(receivers(filter)),
    db
      .select({ shop: shops.shop, name: shops.name, email: shopAddress })
      .from(shops)
      .where(receivers(filter))
      .orderBy(shops.shop)
      .limit(PREVIEW_SAMPLE),
  ]);
  const matched = Number(matchedRows[0]?.n ?? 0);
  const withAddr = Number(withAddressRows[0]?.n ?? 0);
  const recipients = Number(receiverRows[0]?.n ?? 0);
  return {
    matched,
    withoutAddress: matched - withAddr,
    unsubscribed: withAddr - recipients,
    recipients,
    sample: sample.flatMap((row) => (row.email === null ? [] : [{ shop: row.shop, name: row.name ?? row.shop, email: row.email }])),
  };
}
