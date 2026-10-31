// Ring 1 — pure. Calendar days and months in a merchant's own IANA time zone, for a quota that resets at the
// merchant's midnight rather than the server's. Time and zone are always parameters.

interface LocalFields {
  readonly year: number;
  readonly month: number; // 0-11
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millis: number;
}

/** Offset of `timeZone` from UTC at an instant, in ms (east is positive). */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const seconds = Math.floor(ms / 1000) * 1000;
  const parts = new Map(formatter.formatToParts(new Date(seconds)).map((part) => [part.type, part.value]));
  const field = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.get(type));
  const asUtc = Date.UTC(field("year"), field("month") - 1, field("day"), field("hour"), field("minute"), field("second"));
  return asUtc - seconds;
}

/**
 * Wall-clock fields in `timeZone` -> instant. A wall time that does not exist (spring-forward gap) resolves forward by
 * the gap; an ambiguous one (fall-back) resolves to the first occurrence.
 */
function fromLocalFields(fields: LocalFields, timeZone: string): number {
  const guess = Date.UTC(fields.year, fields.month, fields.day, fields.hour, fields.minute, fields.second, fields.millis);
  const firstOffset = zoneOffsetMs(guess, timeZone);
  const candidate = guess - firstOffset;
  const secondOffset = zoneOffsetMs(candidate, timeZone);
  return secondOffset === firstOffset ? candidate : guess - secondOffset;
}

/** Whether `timeZone` is a zone the runtime knows. `Intl` refuses anything else, which is the only reliable test. */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch (error) {
    // `Intl` signals an unknown zone with a RangeError; that IS the answer here. Anything else is not ours to hide.
    if (error instanceof RangeError) return false;
    throw error;
  }
}

/** `YYYY-MM-DD` of `at` in `timeZone` (the merchant's own calendar day). */
export function dayInZone(at: number, timeZone: string): string {
  // The `sv-SE` locale is ISO-ordered (year-month-day) by definition.
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/**
 * Midnight at the START of a calendar date in `timeZone` (month is 1-12). A date that does not exist (Feb 30, month 13)
 * is a programmer error and throws `RangeError`: it must never roll forward into a different day.
 */
export function startOfLocalDay(date: { readonly year: number; readonly month: number; readonly day: number }, timeZone: string): number {
  const check = new Date(Date.UTC(date.year, date.month - 1, date.day));
  if (check.getUTCFullYear() !== date.year || check.getUTCMonth() !== date.month - 1 || check.getUTCDate() !== date.day) {
    throw new RangeError(`not a calendar date: ${date.year}-${date.month}-${date.day}`);
  }
  return fromLocalFields({ year: date.year, month: date.month - 1, day: date.day, hour: 0, minute: 0, second: 0, millis: 0 }, timeZone);
}

export interface MonthWindow {
  /** `YYYY-MM`, the zone's own month. */
  readonly key: string;
  /** Inclusive start, epoch ms. */
  readonly start: number;
  /** Exclusive end, epoch ms: the start of the next month. */
  readonly end: number;
}

/** The calendar month of `timeZone` that contains `at`. Throws `RangeError` for a zone `Intl` does not know. */
export function monthWindowInZone(at: number, timeZone: string): MonthWindow {
  const [year = 1970, month = 1] = dayInZone(at, timeZone).split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    key: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`,
    start: startOfLocalDay({ year, month, day: 1 }, timeZone),
    end: startOfLocalDay({ year: nextYear, month: nextMonth, day: 1 }, timeZone),
  };
}
