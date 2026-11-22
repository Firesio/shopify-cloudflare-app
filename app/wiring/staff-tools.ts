import type { ActionTool, DefineStaffTools, ResourceTool, StaffTools } from "@firesio/app/portal-client";
import type { SettingsService } from "@firesio/app/settings";
import { GENERAL_SETTINGS } from "~/core/settings";

/** What the staff tools below read of the services bag (`createFiresio` hands the whole one; a handler names only what it uses). */
export interface StaffToolsServices {
  readonly settings: SettingsService;
}

/**
 * THE app's staff tools: what the portal draws for the team and turns into MCP tools (`createFiresio({ staffTools })`, and `staffTools: true` in the
 * portal's `declared-apps.ts`). A RESOURCE is a table (its columns AND the function that reads a page of it), a PANEL a block on a shop's page, an ACTION a
 * form that changes something (its fields AND the function that does it). The declaration is checked when it is defined with the contract's own schema,
 * every input again when it arrives and every answer before it leaves (a raw email address in a cell is refused: mask it with `maskAddress`).
 *
 * The example is one resource and one action over the sample settings group; replace both with the app's own (a promo-code table, a "grant credits" form).
 * `run` happens once per `requestId` (a double click does it once and gets the first answer again); the portal decides who may press it.
 */
const settingsChanges = <S extends StaffToolsServices>(): ResourceTool<S> => ({
  id: "settings_changes",
  title: "Settings changes",
  description: "Who changed which general setting of a shop, newest first.",
  account: "required",
  columns: [
    { key: "key", title: "Setting", type: "code" },
    { key: "actor", title: "By", type: "code" },
    { key: "at", title: "When", type: "datetime", format: "relative" },
  ],
  list: async (query, services) => {
    const shop = query.account?.id;
    if (shop === undefined) return { ok: false, reason: "this table is about one shop" };
    const page = await services.settings.history(shop, { limit: query.limit, ...(query.cursor === undefined ? {} : { before: Number(query.cursor) }) });
    return {
      ok: true,
      value: {
        rows: page.rows.map((row) => ({ id: String(row.id), cells: { key: `${row.group}.${row.key}`, actor: row.actor, at: new Date(row.at).toISOString() } })),
        ...(page.next === null ? {} : { nextCursor: String(page.next) }),
      },
    };
  },
});

const resetGeneralSettings = <S extends StaffToolsServices>(): ActionTool<S> => ({
  id: "reset_general_settings",
  title: "Reset the general settings",
  description: "Puts the shop's general settings back to their defaults (the history keeps what they were).",
  target: "account",
  danger: "caution",
  confirmLabel: "Reset",
  run: async (_input, context, services) => {
    const shop = context.account?.id;
    if (shop === undefined) return { ok: false, reason: "this action is about one shop" };
    const saved = await services.settings.save(shop, GENERAL_SETTINGS, GENERAL_SETTINGS.defaults, { actor: `staff:${context.actor}`, source: "system" });
    if (!saved.ok) return { ok: false, reason: "the settings could not be reset" };
    return { ok: true, value: { message: saved.changed ? "The general settings are back to their defaults." : "They already were the defaults." } };
  },
});

export function staffTools<S extends StaffToolsServices>(define: DefineStaffTools<S>): StaffTools<S> {
  return define({ resources: [settingsChanges()], actions: [resetGeneralSettings()] });
}
