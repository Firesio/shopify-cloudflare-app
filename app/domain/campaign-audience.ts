import { formatDate } from "~/i18n/format";
import { UTC } from "~/i18n/time-zone";

/**
 * Who an announcement goes to. PURE: this says what can be asked and how to put it in words; turning it into a query
 * is `models/campaign-audience.server.ts`.
 *
 * Whatever the filter says, an announcement only ever goes to shops where the app is still installed, and never to an
 * address that unsubscribed or that we hold no address for. Those are not filters: nobody can switch them off.
 *
 * Adding a filter: a key in AUDIENCE_FILTER_KEYS and a field on AudienceFilter, an entry in AUDIENCE_FILTER_SPECS here
 * (the words) and one in AUDIENCE_CONDITIONS in the model (the query). The compiler names each one you forgot.
 */
export const AUDIENCE_KINDS = ["real", "dev", "all"] as const;
export type AudienceKind = (typeof AUDIENCE_KINDS)[number];

export interface AudienceFilter {
  /** Paying-type shops only, development stores only, or both. */
  readonly kind: AudienceKind;
  /** Installed on or after this instant (epoch ms), or no lower bound. */
  readonly installedAfter: number | null;
  /** Installed before this instant (epoch ms), or no upper bound. */
  readonly installedBefore: number | null;
}

export const AUDIENCE_FILTER_KEYS = ["kind", "installedAfter", "installedBefore"] as const satisfies readonly (keyof AudienceFilter)[];
export type AudienceFilterKey = (typeof AUDIENCE_FILTER_KEYS)[number];

/** Real stores: an announcement is for the merchants who run the app, not for the test stores around it. */
export const DEFAULT_AUDIENCE: AudienceFilter = { kind: "real", installedAfter: null, installedBefore: null };

export function isAudienceKind(value: string): value is AudienceKind {
  return AUDIENCE_KINDS.some((kind) => kind === value);
}

const KIND_LABEL: Readonly<Record<AudienceKind, string>> = {
  real: "Real stores only (development stores left out)",
  dev: "Development stores only",
  all: "Real and development stores",
};

export interface AudienceFilterSpec {
  /** The filter as one line, or null when it is not narrowing anything. */
  readonly describe: (filter: AudienceFilter) => string | null;
}

/** Keyed by the union, so a filter cannot exist without its words. */
export const AUDIENCE_FILTER_SPECS: Readonly<Record<AudienceFilterKey, AudienceFilterSpec>> = {
  kind: { describe: (filter) => KIND_LABEL[filter.kind] },
  installedAfter: {
    describe: (filter) => (filter.installedAfter === null ? null : `Installed on or after ${formatDate("en", filter.installedAfter, UTC)}`),
  },
  installedBefore: {
    describe: (filter) => (filter.installedBefore === null ? null : `Installed before ${formatDate("en", filter.installedBefore, UTC)}`),
  },
};

/** The audience in plain sentences, one per active filter, for the review step. */
export function describeAudience(filter: AudienceFilter): readonly string[] {
  return AUDIENCE_FILTER_KEYS.flatMap((key) => {
    const line = AUDIENCE_FILTER_SPECS[key].describe(filter);
    return line === null ? [] : [line];
  });
}

/** Why some shops matched but will not receive it, in the order a person would ask. */
export interface AudiencePreview {
  /** Installed shops that match the filter. */
  readonly matched: number;
  /** Of those, how many have no address on file. */
  readonly withoutAddress: number;
  /** Of those with an address, how many unsubscribed. */
  readonly unsubscribed: number;
  /** Who would actually receive it. */
  readonly recipients: number;
  /** A few of them, so the number is not abstract. */
  readonly sample: readonly { readonly shop: string; readonly name: string; readonly email: string }[];
}
