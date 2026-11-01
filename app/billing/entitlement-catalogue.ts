import type { EntitlementCatalogue } from "~/domain/entitlement-policy";
import { PLANS } from "~/billing/plans";

export const ENTITLEMENT_CATALOGUE: EntitlementCatalogue = {
  version: 1,
  freePlan: "free",
  features: {
    "ai.reply_draft": { kind: "capability" },
    "ai.monthly_tokens": { kind: "quota", period: "calendar_month" },
    "projects.max": { kind: "capacity" },
    // How many ACTIVE members a shop may have (`app/members`). `unlimited` on every plan means the app does not limit
    // its team; give a plan a `limit` to start. Remove the key altogether and the limit is simply not asked.
    "members.max": { kind: "capacity" },
  },
  plans: {
    free: {
      ...PLANS.free.entitlements,
    },
    pro: {
      ...PLANS.pro.entitlements,
    },
  },
};

export const DISPLAY_PLANS = PLANS;
