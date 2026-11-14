import type { PreferenceChange, PreferenceStore, StoredPreferences } from "@firesio/notify";

/** The store's notification choices, one row per (shop, type, channel). Absence is the type's default. */
export function d1Preferences(db: D1Database, now: () => number): PreferenceStore<string> {
  return {
    async load(shop): Promise<StoredPreferences> {
      const rows = await db.prepare(`SELECT event, channel, enabled FROM notification_preferences WHERE scope = ?1`).bind(shop).all();
      const stored: Record<string, Record<string, boolean>> = {};
      for (const row of rows.results) {
        const { event, channel, enabled } = row;
        if (typeof event !== "string" || typeof channel !== "string" || typeof enabled !== "number") continue;
        (stored[event] ??= {})[channel] = enabled === 1;
      }
      return stored;
    },
    async save(shop, changes: readonly PreferenceChange[]) {
      const at = now();
      const upsert = db.prepare(
        `INSERT INTO notification_preferences (scope, event, channel, enabled, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
ON CONFLICT (scope, event, channel) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      );
      await db.batch(changes.map((change) => upsert.bind(shop, change.type, change.channel, change.on ? 1 : 0, at)));
    },
  };
}
