import type { LanguageCode } from "./catalogues.generated";

/**
 * Locale-aware formatting via the platform's `Intl`, which workerd implements
 * natively — no library, no data files.
 *
 * Every function is PURE and takes the language explicitly: never read an ambient
 * language here. That is what makes these testable and keeps them in ring 1
 * (@rules/architecture.md).
 *
 * Translating strings is not enough on its own. `1/2/2026` means January 2nd in
 * en and February 1st in es, and `1,5` is one-and-a-half in es but a thousand in
 * en. Formatting a date or number by hand is a localisation bug.
 */

/**
 * `timeZone` is required, never defaulted: leaving it to the runtime renders the server's zone on the server and the
 * visitor's zone in the browser, which is a hydration mismatch. See `./time-zone`.
 */
export function formatDate(
  language: LanguageCode,
  value: Date | number,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  return new Intl.DateTimeFormat(language, { ...options, timeZone }).format(value);
}

export function formatDateTime(
  language: LanguageCode,
  value: Date | number,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(value);
}

export function formatNumber(
  language: LanguageCode,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(language, options).format(value);
}

/**
 * Money. Takes **integer minor units** and the currency, together — the only
 * representation allowed in this codebase (@rules/code-craft.md). Passing a
 * float here is a bug at the call site.
 */
export function formatMoney(
  language: LanguageCode,
  minorUnits: number,
  currency: string,
): string {
  const formatter = new Intl.NumberFormat(language, {
    style: "currency",
    currency,
  });
  // Currencies differ in their number of decimals (JPY has 0, USD 2, KWD 3), so
  // derive the divisor from the locale data rather than assuming 100.
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(minorUnits / 10 ** digits);
}

/** "a, b and c" / "a, b y c" — never join with a hardcoded ", ". */
export function formatList(
  language: LanguageCode,
  items: readonly string[],
  type: "conjunction" | "disjunction" = "conjunction",
): string {
  return new Intl.ListFormat(language, { style: "long", type }).format(items);
}

/** "3 days ago" / "hace 3 días". */
export function formatRelativeTime(
  language: LanguageCode,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
): string {
  return new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(
    value,
    unit,
  );
}
