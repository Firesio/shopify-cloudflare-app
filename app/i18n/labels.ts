import { englishMembersLabels, type MembersLabels } from "@firesio/app-ui/members";
import { englishPlansLabels, type PlansLabels } from "@firesio/app-ui/plans";
import { englishSupportLabels, type SupportLabels } from "@firesio/app-ui/support";
import { identity } from "~/core/identity";
import { PLANS } from "~/core/plans";

/**
 * The words of the merchant pages (`@firesio/app-ui` has no translation system: it takes plain label objects). One function per
 * page group, per language. English is the only one shipped: to add Spanish, return `spanishPlansLabels(...)` when
 * `languageOf(locale) === "es"`. A label an app does not translate falls back to the library's English.
 */
export function supportLabels(_locale: string): SupportLabels {
  return englishSupportLabels;
}

export function membersLabels(_locale: string): MembersLabels {
  return { ...englishMembersLabels, appName: identity.name };
}

export function plansLabels(_locale: string): PlansLabels {
  return {
    ...englishPlansLabels,
    plans: Object.fromEntries(Object.entries(PLANS).map(([handle, plan]) => [handle, { name: plan.name }])),
    entitlements: {
      "tickets.max": { name: "Open support tickets" },
      "members.max": { name: "Team members" },
      "mail.daily_max": { name: "Emails per day" },
    },
  };
}
