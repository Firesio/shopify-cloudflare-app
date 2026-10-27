// The shipped catalogues, found by folder, not listed.
//
// workerd has no filesystem, so i18next-fs-backend cannot work, and an HTTP backend would add a network round-trip to
// every cold render. `import.meta.glob` bundles every `locales/<code>/<namespace>.json` at build time: a new language
// folder is picked up with no edit here. This module is for the SERVER (and tests); the browser loads one language at a
// time through `client-loaders.ts` and must never import this file.
import { buildResources, type ResourceMap } from "./catalogue-modules";
import { withIdentity } from "./identity-values";
import type { CatalogueResources } from "./catalogues.generated";

const modules = import.meta.glob("./locales/*/*.json", { eager: true });

export const resources: ResourceMap = withIdentity(buildResources(modules));

/** `en` is the key source: every other locale is type-checked by the parity test against it. */
export type Resources = Omit<CatalogueResources, "common"> & {
  common: CatalogueResources["common"] & { appName: string };
};
