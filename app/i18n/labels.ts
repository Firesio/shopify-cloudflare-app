/**
 * What the plans page calls each entitlement key of `core/plans.ts`. The preset's other label objects (support, members, plans)
 * are its English; to translate a page group, pass `labels.members(locale)` and the like to `createFiresio` in
 * `app/firesio.server.ts`. A label an app does not translate falls back to the library's English.
 */
export const ENTITLEMENT_LABELS = {
  "tickets.max": { name: "Open support tickets" },
  "members.max": { name: "Team members" },
  "mail.daily_max": { name: "Emails per day" },
} as const;
