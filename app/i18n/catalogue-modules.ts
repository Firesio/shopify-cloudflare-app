// Turns the files found under `locales/` into resources. Pure: it is handed the module map (`import.meta.glob` in the
// app, a map built from a temp folder in a test), so a new language folder needs no edit here.
import { deepFreeze } from "~/lib/language/text";

const LOCALE_FILE = /^\.\/locales\/([^/]+)\/([^/]+)\.json$/;
const LANGUAGE_FILE = "language";

export type ResourceMap = Readonly<Record<string, Readonly<Record<string, object>>>>;

function parsePath(path: string): { code: string; namespace: string } | null {
  const match = LOCALE_FILE.exec(path);
  const code = match?.[1];
  const namespace = match?.[2];
  if (code === undefined || namespace === undefined || namespace === LANGUAGE_FILE) return null;
  return { code, namespace };
}

/** The JSON a module holds: Vite gives `{ default }` for a JSON module. */
export function jsonOf(module: unknown): object {
  if (typeof module === "object" && module !== null && "default" in module) {
    const value = module.default;
    if (typeof value === "object" && value !== null) return value;
  }
  throw new Error("a locale file did not load as a JSON object");
}

/**
 * `{ code: { namespace: json } }` from eagerly imported modules, every namespace file of every language folder. Built ONCE
 * and DEEP-FROZEN: every request of every shop reads these objects, so nothing may be able to change them.
 */
export function buildResources(modules: Readonly<Record<string, unknown>>): ResourceMap {
  const byCode: Record<string, Record<string, object>> = {};
  for (const [path, module] of Object.entries(modules)) {
    const parsed = parsePath(path);
    if (parsed === null) continue;
    byCode[parsed.code] = { ...byCode[parsed.code], [parsed.namespace]: jsonOf(module) };
  }
  return deepFreeze(byCode);
}
