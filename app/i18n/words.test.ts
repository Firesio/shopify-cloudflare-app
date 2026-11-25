import { describeI18nTargets } from "@firesio/app/i18n/testing";
import { describe, expect, it } from "vitest";
import { CATALOGUE } from "./index";
import { WORDS } from "./words";

/**
 * The words declaration (`words.ts`) held to the catalogue, and the files built for each extension target. The template has no `extensions/*` with `locales/`,
 * so `targets` is empty and only the declaration is checked. `docs/LANGUAGES.md` ("Words for an extension") says how an app adds one.
 */
describeI18nTargets({ describe, it, expect }, { words: WORDS, catalogue: CATALOGUE, targets: {}, root: "../.." });
