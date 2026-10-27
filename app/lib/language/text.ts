// Layered text. Pure apart from building an i18next instance: nothing here knows the app, its namespaces or its catalogue.
import { createInstance, type i18n } from "i18next";

/**
 * One source of strings for ONE language: the shipped catalogue, a per-customer override table, a merchant's own
 * language. A layer says which keys it holds (`keys`) and what a key says (`get`); it never decides priority.
 * Keys are dotted paths inside a namespace (`support.reply.subject`).
 */
export interface TextLayer {
  readonly name: string;
  keys(namespace: string): readonly string[];
  get(namespace: string, key: string): string | undefined;
}

export interface TextKey {
  readonly namespace: string;
  readonly key: string;
}

/**
 * A registry of the things a reader sees as one piece (an email, a page): unit name -> the keys it needs. A unit is only
 * shown in a language that has ALL of its keys, so a half-translated email is never sent.
 */
export type TextUnits = Readonly<Record<string, readonly TextKey[]>>;

/** First layer that has the key wins: layers are ordered highest priority first. */
export function resolveText(layers: readonly TextLayer[], namespace: string, key: string): string | undefined {
  for (const layer of layers) {
    const value = layer.get(namespace, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

/** True when every key of `unit` resolves through `layers`. An unknown unit is not complete. */
export function isUnitComplete(units: TextUnits, unit: string, layers: readonly TextLayer[]): boolean {
  const keys = units[unit];
  if (keys === undefined) return false;
  return keys.every(({ namespace, key }) => resolveText(layers, namespace, key) !== undefined);
}

interface Tree {
  [key: string]: string | Tree;
}

/** Segments that would reach an object's prototype: a stored override row must never be able to name them. */
const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** A NEW nested object from dotted keys. Nothing it is given is mutated or shared with the result. */
function nest(entries: readonly (readonly [string, string])[]): Tree {
  const root: Tree = {};
  for (const [key, value] of entries) {
    const segments = key.split(".");
    if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) continue;
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      const existing = node[segment];
      if (typeof existing === "object") {
        node = existing;
      } else {
        const created: Tree = {};
        node[segment] = created;
        node = created;
      }
    }
    node[segments[segments.length - 1] ?? key] = value;
  }
  return root;
}

/** Only the keys of one text unit, valued by the highest-priority layer that has each. A key no layer has is ABSENT. */
function unitResources(layers: readonly TextLayer[], keys: readonly TextKey[]): Record<string, Tree> {
  const byNamespace = new Map<string, (readonly [string, string])[]>();
  for (const { namespace, key } of keys) {
    const value = resolveText(layers, namespace, key);
    if (value === undefined) continue;
    byNamespace.set(namespace, [...(byNamespace.get(namespace) ?? []), [key, value]]);
  }
  return Object.fromEntries([...byNamespace].map(([namespace, entries]) => [namespace, nest(entries)]));
}

export interface TranslatorBase {
  readonly namespaces: readonly string[];
  readonly defaultNamespace: string;
  /** Interpolation values every string may use without passing them (`{{appName}}`). */
  readonly defaultVariables?: Readonly<Record<string, string>>;
  /**
   * HTML-escape interpolated values. On by default. Turn it off ONLY when the output goes through a renderer that escapes
   * (React, React Email), which would otherwise show `O&#39;Brien`.
   */
  readonly escapeValue?: boolean;
}

/** Control characters that cannot appear in any text (the validator rejects them), used so i18next's own syntax never matches. */
const NEVER_IN_TEXT = "\u0001";

/**
 * A FRESH i18next instance for ONE render of ONE text unit, over a NEW object that holds only that unit's keys.
 *
 * Fresh because an isolate serves many shops: a shared instance would carry one shop's overrides into another's email.
 * A new object because the shipped catalogue is shared by every request and must never be mutated by an override.
 * `layers` are ordered highest priority first. There is NO fallback language here: choosing a language that has the
 * whole unit is decided outside (the caller), so a half-translated unit is never rendered. Text from a layer is data:
 * nesting (`$t(...)`) and unescaped interpolation (`{{- x}}`) are switched off, empty strings count as missing.
 */
export function createTranslator(
  language: string,
  layers: readonly TextLayer[],
  keys: readonly TextKey[],
  base: TranslatorBase,
): i18n {
  const instance = createInstance();
  void instance.init({
    lng: language,
    fallbackLng: false,
    defaultNS: base.defaultNamespace,
    ns: [...base.namespaces],
    resources: { [language]: unitResources(layers, keys) },
    // Synchronous: the resources are in memory, there is nothing to wait for.
    initAsync: false,
    returnEmptyString: false,
    returnNull: false,
    interpolation: {
      escapeValue: base.escapeValue ?? true,
      defaultVariables: { ...base.defaultVariables },
      unescapePrefix: NEVER_IN_TEXT,
      nestingPrefix: `${NEVER_IN_TEXT}nest(`,
      nestingSuffix: `)${NEVER_IN_TEXT}`,
    },
  });
  if (!instance.isInitialized) throw new Error("the translator did not initialise synchronously");
  return instance;
}

/**
 * Translate one key through an instance made by `createTranslator`. The caller's key type (a generated union) is the
 * safety; i18next's own typing is bypassed here on purpose, because a namespace chosen at run time cannot satisfy it.
 * A key with no text comes back as the key, never as an object or undefined.
 */
export function translateKey(
  instance: i18n,
  language: string,
  namespace: string,
  key: string,
  values: Readonly<Record<string, string | number>> = {},
): string {
  const result: unknown = Reflect.apply(instance.t, instance, [key, { ...values, lng: language, ns: namespace }]);
  return typeof result === "string" ? result : key;
}
