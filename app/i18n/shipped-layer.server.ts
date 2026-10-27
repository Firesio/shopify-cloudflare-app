import { LANGUAGE_CODES, NAMESPACES, type LanguageCode } from "./catalogues.generated";
import { resources } from "./resources";
import { deepFreeze, type TextLayer } from "~/lib/language/text";

type FlatStrings = Readonly<Record<string, string>>;

/** Every string of a nested catalogue as [flat dotted key, text]. */
function leaves(value: object, prefix = ""): readonly (readonly [string, string])[] {
  return Object.entries(value).flatMap(([key, child]): (readonly [string, string])[] => {
    if (typeof child === "string") return [[`${prefix}${key}`, child]];
    if (typeof child === "object" && child !== null) return [...leaves(child, `${prefix}${key}.`)];
    return [];
  });
}

/**
 * The shipped catalogues FLATTENED, once, at load: language -> namespace -> flat key -> text. Immutable (deep-frozen), so
 * sharing it between every request of every shop is safe, and no render ever rebuilds it.
 */
const FLAT: Readonly<Record<string, Readonly<Record<string, FlatStrings>>>> = deepFreeze(
  Object.fromEntries(
    LANGUAGE_CODES.map((code) => [
      code,
      Object.fromEntries(NAMESPACES.map((namespace) => [namespace, Object.fromEntries(leaves(resources[code]?.[namespace] ?? {}))])),
    ]),
  ),
);

/** The shipped catalogue of one language as a text layer: the bottom layer of every translator. Reads, never writes. */
export function shippedLayer(language: LanguageCode): TextLayer {
  return {
    name: `shipped:${language}`,
    get: (namespace, key) => FLAT[language]?.[namespace]?.[key],
  };
}
