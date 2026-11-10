import type { LanguageCode } from "~/i18n/catalogues.generated";

const KIB = 1024;
const MIB = 1024 * KIB;

/**
 * A file size for display, in the reader's language.
 *
 * Kilobytes below one megabyte (never "0 KB": a non-empty file is at least 1),
 * megabytes above, with `Intl` supplying the unit word and the decimal mark, so
 * nothing here is translated text or a hand-formatted number.
 */
export function formatFileSize(language: LanguageCode, sizeBytes: number): string {
  if (sizeBytes < MIB) {
    return new Intl.NumberFormat(language, { style: "unit", unit: "kilobyte", unitDisplay: "short", maximumFractionDigits: 0 }).format(
      Math.max(1, Math.round(sizeBytes / KIB)),
    );
  }
  return new Intl.NumberFormat(language, { style: "unit", unit: "megabyte", unitDisplay: "short", maximumFractionDigits: 1 }).format(
    sizeBytes / MIB,
  );
}

/** A byte limit as whole megabytes, for the "up to 10 MB" line. */
export function formatLimit(language: LanguageCode, maxBytes: number): string {
  return new Intl.NumberFormat(language, { style: "unit", unit: "megabyte", unitDisplay: "short", maximumFractionDigits: 0 }).format(
    Math.round(maxBytes / MIB),
  );
}
