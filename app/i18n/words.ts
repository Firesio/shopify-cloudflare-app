import { defineWords } from "@firesio/app/i18n/build";

/**
 * What the app's words are (`@firesio/app/i18n/build`): one entry per namespace of `locales/<source>/`, who reads it, and where it goes. `checkWords`
 * (run by `words.test.ts`) fails when a folder of the catalogue is not declared here, or a declared one has no source file.
 *
 * `runtime` names the places that are not built into a file here: the embedded and public pages (`page`) and the Worker, where the mail is written (`server`).
 * A Shopify extension is a name of `TARGETS` in `words.test.ts` instead (the template has none; `docs/LANGUAGES.md`, "Words for an extension").
 *
 * `app` holds the embedded admin, the public pages, the onboarding checklist and the mail in one file, so its audience is the one that reads most of it, the merchant
 * (the mail's `mail.*` keys are read by the merchant's customers; split them into their own namespace, `audience: "customer"`, when an app needs them told apart).
 * No group is `editable`: no `layers` are configured in `app/i18n/index.ts`, so a merchant cannot overwrite a word. An app that adds a layer of the merchants' edits marks the
 * namespaces they may change `editable: true` (never one that also goes to an extension: Shopify gives a merchant no way to edit an extension's words).
 */
export const WORDS = defineWords({
  source: "en",
  runtime: ["page", "server"],
  groups: {
    app: { audience: "merchant", targets: ["page", "server"] },
  },
});
