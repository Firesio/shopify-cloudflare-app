import { defineSettings } from "@firesio/app/settings";
import { z } from "zod";

/**
 * THE app's settings groups (`@firesio/app/settings`): one value per shop and group, stored as JSON in `shop_settings` (no column
 * per field, so a group may grow without a migration; a change of shape is a `version` and an `upgrade` step). The page that edits
 * them is `routes/app/settings.tsx`. TODO: replace this sample group with the app's own; keep the shape (schema, defaults, rules).
 */
export const GENERAL_SETTINGS = defineSettings("general", {
  version: 1,
  schema: z.object({
    signature: z.string().trim().max(200),
    weeklySummary: z.boolean(),
    summaryDay: z.enum(["monday", "friday"]),
  }),
  defaults: { signature: "", weeklySummary: false, summaryDay: "monday" },
  // The day only means something while the summary is on: hidden when it is off, and back to its default (the schema takes no
  // null) on the server for every save and in the form for every edit.
  visibleWhen: { summaryDay: (value) => value.weeklySummary },
  clearWhen: { summaryDay: (value) => !value.weeklySummary },
});

/** Every group the preset serves (`createFiresio({ settings })`). */
export const SETTINGS = [GENERAL_SETTINGS] as const;
