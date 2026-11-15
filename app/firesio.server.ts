import { createFiresio } from "@firesio/app";
import { apiVersion } from "~/core/api-version";
import { identity } from "~/core/identity";
import { MEMBERS } from "~/core/members";
import { PLANS } from "~/core/plans";
import { POLARIS_URL } from "~/core/polaris";
import * as schema from "~/db/schema";
import { ENTITLEMENT_LABELS } from "~/i18n/labels";

/**
 * The whole glue of the app (`docs/architecture.md` section 6.6 of the platform repo): the preset builds every service, the
 * guard, the Worker's handlers and the AdminApi from this one call, and each option below is something that DIFFERS from the
 * preset's default. Nothing here reads a binding: it is all built on first use, once per isolate.
 */
export const firesio = createFiresio({
  identity: { name: identity.name, slug: identity.slug },
  plans: PLANS,
  members: MEMBERS,
  schema,
  // The plans page's names for the entitlement keys of `core/plans.ts`, and the meter of the one that is a daily counter
  // (the open-ticket meter is the preset's own).
  labels: { entitlements: ENTITLEMENT_LABELS },
  meters: [{ key: "mail.daily_max", source: { kind: "counter", counter: "mail.daily", period: "day" } }],
  // The queues `wrangler.jsonc` consumes (the preset's default is these two names; `npm run new-app` renames them with the app's).
  webhookQueues: ["shopify-webhooks", "shopify-webhooks-prod"],
  // One decision with `api_version` in both `shopify.app*.toml`, and one Polaris release for the preload header and `AppProvider`.
  shopify: { apiVersion, polarisUrl: POLARIS_URL },
});
