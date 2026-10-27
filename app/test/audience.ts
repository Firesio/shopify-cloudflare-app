import type { AudienceText } from "~/i18n/audience";
import type { TextUnit } from "~/i18n/text-units";
import { audienceTextFor } from "~/wiring/audience.server";

/** The audience text the app's own builder gives for a recipient locale (undefined = nothing known, so the default). */
export function audienceTextOf(locale?: string, unit: TextUnit = "email.layout"): Promise<AudienceText> {
  return audienceTextFor({ unit, evidence: [locale] });
}
