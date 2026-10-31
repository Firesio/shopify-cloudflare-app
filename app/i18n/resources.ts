// The shipped catalogues, found by folder, not listed.
//
// workerd has no filesystem, so i18next-fs-backend cannot work, and an HTTP backend would add a network round-trip to
// every cold render. `import.meta.glob` bundles every `locales/<code>/<namespace>.json` at build time: a new language
// folder is picked up with no edit here. This module is for the SERVER (and tests); the browser is sent the namespaces it
// needs (`i18n.client.ts`) and must never import this file.
import { buildResources, type ResourceMap } from "./catalogue-modules";
import type { CatalogueResources } from "./catalogues.generated";

const modules = import.meta.glob("./locales/*/*.json", { eager: true });

/** Deep-frozen: shared by every request of every shop. */
export const resources: ResourceMap = buildResources(modules);

/** `en` is the key source: every other language is type-checked by the parity test against it. */
export type Resources = CatalogueResources;
