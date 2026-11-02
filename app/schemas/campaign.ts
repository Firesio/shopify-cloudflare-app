import { z } from "zod";
import { AUDIENCE_KINDS, DEFAULT_AUDIENCE, type AudienceFilter } from "~/domain/campaign-audience";

/**
 * The audience filter at the two edges it crosses: read back from the `campaigns.audience` column (stored values
 * outlive the code, so a field added later has a default and a retired one is dropped) and read from the editor form.
 * The `satisfies` keeps this schema and `AudienceFilter` one shape: a field added to one without the other fails here.
 */
const instant = z.number().int().nonnegative().nullable();

export const audienceFilterSchema = z.object({
  kind: z.enum(AUDIENCE_KINDS).default(DEFAULT_AUDIENCE.kind),
  installedAfter: instant.default(null),
  installedBefore: instant.default(null),
}) satisfies z.ZodType<AudienceFilter, unknown>;

/** The stored JSON text as a filter. A value that cannot be read becomes the default rather than an error page. */
export function parseStoredAudience(text: string): AudienceFilter {
  try {
    const parsed = audienceFilterSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : DEFAULT_AUDIENCE;
  } catch {
    return DEFAULT_AUDIENCE;
  }
}

/** A date input's `YYYY-MM-DD` as the start of that day in UTC (epoch ms), or null when blank or not a real date. */
export function dayToInstant(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const instantMs = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(instantMs);
  // Date.UTC rolls 31 Feb over to March; a real date comes back unchanged.
  return roundTrip.getUTCFullYear() === year && roundTrip.getUTCMonth() === month - 1 && roundTrip.getUTCDate() === day ? instantMs : null;
}

/** The inverse, for filling a date input. */
export function instantToDay(instantMs: number | null): string {
  return instantMs === null ? "" : new Date(instantMs).toISOString().slice(0, 10);
}

/** The editor's audience fields as a filter. An unknown kind falls back to the default instead of failing the save. */
export function audienceFromForm(form: { readonly get: (name: string) => unknown }): AudienceFilter {
  const kind = String(form.get("audienceKind") ?? "");
  return {
    kind: AUDIENCE_KINDS.find((candidate) => candidate === kind) ?? DEFAULT_AUDIENCE.kind,
    installedAfter: dayToInstant(String(form.get("installedAfter") ?? "")),
    installedBefore: dayToInstant(String(form.get("installedBefore") ?? "")),
  };
}
