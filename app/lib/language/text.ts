// Layered text. Pure apart from building an i18next instance: nothing here knows the app, its namespaces or its catalogue.
import { createInstance, type i18n } from "i18next";

/**
 * One source of strings for ONE language: the shipped catalogue, a per-customer override table, a merchant's own
 * language. A layer says what a key says (`get`); it never decides priority. Keys are FLAT: a dotted path inside a
 * namespace is just a name (`support.reply.subject`), never a path into a nested object.
 */
export interface TextLayer {
  readonly name: string;
  get(namespace: string, key: string): string | undefined;
}

/**
 * One piece of text a unit needs. `plural` marks a plural group: `key` is the base (`items`) and the strings are
 * `items_one`, `items_other`... one per category the LANGUAGE has (`Intl.PluralRules`), so a unit is complete in Arabic
 * only with all six forms and in English with two.
 */
export interface TextKey<N extends string = string, K extends string = string> {
  readonly namespace: N;
  readonly key: K;
  readonly plural?: true;
}

/**
 * A registry of the things a reader sees as one piece (an email, a page): unit name -> the keys it needs. A unit is only
 * shown in a language that has ALL of its keys, so a half-translated email is never sent.
 */
export type TextUnits = Readonly<Record<string, readonly TextKey[]>>;

/**
 * First layer that has text for the key wins: layers are ordered highest priority first. "Has text" is defined HERE and
 * nowhere else: a non-empty string. An empty string is missing, so it neither counts as complete nor shadows a lower layer.
 */
export function resolveText(layers: readonly TextLayer[], namespace: string, key: string): string | undefined {
  for (const layer of layers) {
    const value = layer.get(namespace, key);
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

/** The plural categories a language has (`en`: one, other; `ar`: zero, one, two, few, many, other). */
function pluralCategories(language: string): readonly Intl.LDMLPluralRule[] {
  return new Intl.PluralRules(language).resolvedOptions().pluralCategories;
}

/** The strings a unit needs in one language: a plural group becomes one key per category of that language. */
function physicalKeys(keys: readonly TextKey[], language: string): readonly TextKey[] {
  return keys.flatMap((entry) =>
    entry.plural === true
      ? pluralCategories(language).map((category) => ({ namespace: entry.namespace, key: `${entry.key}_${category}` }))
      : [{ namespace: entry.namespace, key: entry.key }],
  );
}

/** True when every string of `unit` resolves through `layers` in `language`. An unknown unit is not complete. */
export function isUnitComplete(units: TextUnits, unit: string, layers: readonly TextLayer[], language: string): boolean {
  const keys = units[unit];
  if (keys === undefined) return false;
  return physicalKeys(keys, language).every(({ namespace, key }) => resolveText(layers, namespace, key) !== undefined);
}

/** Only the strings of one text unit, FLAT and in a NEW object, valued by the highest-priority layer that has each. */
function unitResources(layers: readonly TextLayer[], keys: readonly TextKey[], language: string): Record<string, Record<string, string>> {
  const byNamespace = new Map<string, Record<string, string>>();
  for (const { namespace, key } of physicalKeys(keys, language)) {
    const value = resolveText(layers, namespace, key);
    if (value === undefined) continue;
    byNamespace.set(namespace, { ...byNamespace.get(namespace), [key]: value });
  }
  return Object.fromEntries(byNamespace);
}

export interface TranslatorBase {
  readonly namespaces: readonly string[];
  readonly defaultNamespace: string;
  /** Values every string may use without passing them (`{{appName}}`). */
  readonly defaultVariables?: Readonly<Record<string, string>>;
  /**
   * HTML-escape interpolated values. On by default. Turn it off ONLY when the output goes through a renderer that escapes
   * (React, React Email), which would otherwise show `O&#39;Brien`.
   */
  readonly escapeValue?: boolean;
}

/** A character that cannot appear in any text (the validator rejects control characters), so i18next's own syntax never matches. */
const NEVER_IN_TEXT = "\u0001";

/**
 * A FRESH i18next instance for ONE render of ONE text unit, over a NEW flat object that holds only that unit's strings.
 *
 * Fresh because an isolate serves many shops: a shared instance would carry one shop's overrides into another's email.
 * A new object because the shipped catalogue is shared by every request and must never be mutated by an override.
 * `layers` are ordered highest priority first. There is NO fallback language here: choosing a language that has the
 * whole unit is decided outside (the caller), so a half-translated unit is never rendered. Text from a layer is data:
 * keys are flat (`keySeparator` and `nsSeparator` off), nesting (`$t(...)`), unescaped interpolation (`{{- x}}`) and
 * formatters (`{{x, number}}`) are switched off, and an empty string is missing.
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
    resources: { [language]: unitResources(layers, keys, language) },
    keySeparator: false,
    nsSeparator: false,
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
      // `{{x, number}}` would run i18next's built-in formatters. With this separator nothing can split a placeholder
      // into a name and a format, so the text stays as written.
      formatSeparator: NEVER_IN_TEXT,
    },
  });
  if (!instance.isInitialized) throw new Error("the translator did not initialise synchronously");
  return instance;
}

/** Named values for a string's `{{placeholders}}`. */
export type TextValues = Readonly<Record<string, string | number>>;

/**
 * Translate one key through an instance made by `createTranslator`. The caller's key type (a unit's keys) is the safety;
 * i18next's own typing is bypassed here on purpose, because a namespace chosen at run time cannot satisfy it.
 *
 * `values` go in `replace`, NOT next to i18next's own options, so a placeholder named like an option (`lng`, `ns`,
 * `context`) cannot change how the lookup works. `count` is its own parameter: it selects the plural form and is also
 * available as `{{count}}`. A key with no text comes back as the key, never as an object or undefined.
 */
export function translateKey(
  instance: i18n,
  language: string,
  namespace: string,
  key: string,
  values: TextValues = {},
  count?: number,
): string {
  const replace = count === undefined ? { ...values } : { ...values, count };
  const options = count === undefined ? { lng: language, ns: namespace, replace } : { lng: language, ns: namespace, replace, count };
  const result: unknown = Reflect.apply(instance.t, instance, [key, options]);
  return typeof result === "string" ? result : key;
}

/** Freeze a value and everything inside it: the catalogues are built once and shared by every request of every shop. */
export function deepFreeze<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value)) {
    if (typeof child === "object" && child !== null && !Object.isFrozen(child)) deepFreeze(child);
  }
  return Object.freeze(value);
}
