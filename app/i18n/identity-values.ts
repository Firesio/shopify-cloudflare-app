import type { ResourceMap } from "./catalogue-modules";
import { identity } from "~/identity";

/** The platform-supplied values, injected (never written in a JSON file, so they cannot drift from `identity`). */
export function withIdentity(resources: ResourceMap): ResourceMap {
  return Object.fromEntries(
    Object.entries(resources).map(([code, namespaces]) => [
      code,
      { ...namespaces, common: { ...namespaces.common, appName: identity.name } },
    ]),
  );
}
