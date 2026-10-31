import type { AudienceText } from "~/i18n/audience";
import type { TextUnit, UnitKeys } from "~/i18n/text-units";
import { parseLanguageTag } from "~/lib/language/tag";
import { audienceTextFor } from "~/wiring/audience.server";

/** The audience text the app's own builder gives for what is known about the reader (undefined = nothing, so the default language). */
export function audienceTextOf(language?: string): Promise<AudienceText<UnitKeys<"email.layout">>>;
export function audienceTextOf<U extends TextUnit>(language: string | undefined, unit: U): Promise<AudienceText<UnitKeys<U>>>;
export function audienceTextOf(language?: string, unit: TextUnit = "email.layout"): Promise<AudienceText<UnitKeys<TextUnit>>> {
  const tag = parseLanguageTag(language);
  return audienceTextFor({ unit, evidence: tag === null ? [] : [tag] });
}
