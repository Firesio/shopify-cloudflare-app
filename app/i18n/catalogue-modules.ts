// Turns the files found under `locales/` into resources and browser loaders. Pure: it is handed the module maps
// (`import.meta.glob` in the app, a map built from a temp folder in a test), so a new language folder needs no edit here.

const LOCALE_FILE = /^\.\/locales\/([^/]+)\/([^/]+)\.json$/;
const LANGUAGE_FILE = "language";

export type ResourceMap = Readonly<Record<string, Readonly<Record<string, object>>>>;
export type BundleLoader = () => Promise<unknown>;

function parsePath(path: string): { code: string; namespace: string } | null {
  const match = LOCALE_FILE.exec(path);
  const code = match?.[1];
  const namespace = match?.[2];
  if (code === undefined || namespace === undefined || namespace === LANGUAGE_FILE) return null;
  return { code, namespace };
}

/** The JSON a module holds: Vite gives `{ default }` for a JSON module. */
function jsonOf(module: unknown): object {
  if (typeof module === "object" && module !== null && "default" in module) {
    const value = module.default;
    if (typeof value === "object" && value !== null) return value;
  }
  throw new Error("a locale file did not load as a JSON object");
}

/** `{ code: { namespace: json } }` from eagerly imported modules, every namespace file of every language folder. */
export function buildResources(modules: Readonly<Record<string, unknown>>): ResourceMap {
  const byCode: Record<string, Record<string, object>> = {};
  for (const [path, module] of Object.entries(modules)) {
    const parsed = parsePath(path);
    if (parsed === null) continue;
    byCode[parsed.code] = { ...byCode[parsed.code], [parsed.namespace]: jsonOf(module) };
  }
  return byCode;
}

/** Lazy loaders keyed by `code` then `namespace`: the browser calls only the ones its language needs. */
export function buildLoaders(
  modules: Readonly<Record<string, BundleLoader>>,
): Readonly<Record<string, Readonly<Record<string, BundleLoader>>>> {
  const byCode: Record<string, Record<string, BundleLoader>> = {};
  for (const [path, load] of Object.entries(modules)) {
    const parsed = parsePath(path);
    if (parsed === null) continue;
    byCode[parsed.code] = { ...byCode[parsed.code], [parsed.namespace]: load };
  }
  return byCode;
}

/** Load the given namespaces of the given languages. A language or namespace with no file is simply absent. */
export async function loadBundles(
  loaders: Readonly<Record<string, Readonly<Record<string, BundleLoader>>>>,
  codes: readonly string[],
  namespaces: readonly string[],
): Promise<ResourceMap> {
  const entries = await Promise.all(
    codes.map(async (code) => {
      const own = loaders[code] ?? {};
      const loaded = await Promise.all(
        namespaces.flatMap((namespace) => {
          const load = own[namespace];
          return load === undefined ? [] : [load().then((module): [string, object] => [namespace, jsonOf(module)])];
        }),
      );
      return [code, Object.fromEntries(loaded)] as const;
    }),
  );
  return Object.fromEntries(entries);
}
