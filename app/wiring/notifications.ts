import { resolveContentDynamic } from "@firesio/content";
import { createNotifier } from "@firesio/notify";
import { emailChannel } from "@firesio/notify/email";
import { d1Preferences } from "~/adapters/d1-preferences";
import { CONTENT, FALLBACK_LOCALE, TRANSLATIONS } from "~/core/content";
import { NOTIFICATIONS } from "~/core/notifications";
import type { Runtime } from "./runtime";

/**
 * The notifier (`@firesio/notify`): the app's notification types over the channels it has. Email only: add Web Push by
 * passing `push: pushChannel(...)` here and `push: "on"` in `core/notifications.ts`. The words come from `@firesio/content`.
 * `EMAIL_FROM` empty means email is off: the channel is not composed and every send reports `skipped:no_adapter`.
 */
export function createNotifierFor(env: Env, runtime: Runtime) {
  const from = env.EMAIL_FROM === "" ? null : env.EMAIL_FROM_NAME === "" ? env.EMAIL_FROM : { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM };
  return createNotifier<string, typeof NOTIFICATIONS>({
    catalogue: NOTIFICATIONS,
    channels: from === null ? {} : { email: emailChannel(env.EMAIL, { from }) },
    preferences: d1Preferences(env.DB, runtime.now),
    render: ({ key, locale, vars }) => resolveContentDynamic(CONTENT, key, { locale: locale ?? FALLBACK_LOCALE, fallbackLocale: FALLBACK_LOCALE, translations: TRANSLATIONS, overrides: {}, vars }),
  });
}
