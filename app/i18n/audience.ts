// THE contract for anything an end customer (or any recipient who is not the merchant) reads: emails, public and customer
// pages. A render depends on an `AudienceText` and on nothing else about languages, so an app that later adds override
// layers, merchant languages or translated content changes how one is BUILT (`app/wiring/audience.server.ts`), never a
// renderer. Admin code (the merchant's own screens) never uses it: it reads `getMerchantLanguage`.
import type { Namespace } from "./config";
import type { CatalogueKeys } from "./catalogues.generated";
import type { TextUnit } from "./text-units";
import type { ContentLocalizer, ContentRef } from "~/lib/language/audience";
import type { AudienceLanguage } from "~/lib/language/roles";

/** Translate one key of one namespace (the generated flat key union), with named values. */
export type AudienceT<N extends Namespace> = (
  key: CatalogueKeys[N],
  values?: Readonly<Record<string, string | number>>,
) => string;

export interface AudienceText {
  readonly language: AudienceLanguage;
  readonly direction: "ltr" | "rtl";
  /** Translate in the default namespace (`common`). */
  readonly t: AudienceT<"common">;
  /** Translate in one namespace: `text.fixedT("email")("support.reply.subject")`. */
  fixedT<N extends Namespace>(namespace: N): AudienceT<N>;
  /** The app's own stored text in this reader's language (the original when there is no translation). */
  content(refs: readonly ContentRef[]): Promise<readonly string[]>;
}

/** What a caller says about the reader. `evidence` is anything that may name a language, most reliable first. */
export interface AudienceQuery {
  readonly shop?: string;
  /** A `TEXT_UNITS` entry: the reader is only shown a language in which the WHOLE unit exists. */
  readonly unit: TextUnit;
  readonly evidence: readonly unknown[];
}

export type AudienceTextFor = (query: AudienceQuery) => Promise<AudienceText>;

export type { ContentLocalizer, ContentRef };
