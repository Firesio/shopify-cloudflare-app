import { NAMESPACES } from "./config";
import { resources } from "./resources";
import type { TextLayer } from "~/lib/language/text";

function leaves(value: object, prefix = ""): readonly (readonly [string, string])[] {
  return Object.entries(value).flatMap(([key, child]): (readonly [string, string])[] => {
    if (typeof child === "string") return [[`${prefix}${key}`, child]];
    if (typeof child === "object" && child !== null) return [...leaves(child, `${prefix}${key}.`)];
    return [];
  });
}

/** The shipped catalogue of one language as a text layer: the bottom layer of every translator. Reads, never writes, the shared resources. */
export function shippedLayer(language: string): TextLayer {
  const byNamespace = new Map<string, ReadonlyMap<string, string>>(
    NAMESPACES.map((namespace) => {
      const source = resources[language]?.[namespace];
      return [namespace, new Map(source === undefined ? [] : leaves(source))];
    }),
  );
  return {
    name: `shipped:${language}`,
    keys: (namespace) => [...(byNamespace.get(namespace)?.keys() ?? [])],
    get: (namespace, key) => byNamespace.get(namespace)?.get(key),
  };
}
