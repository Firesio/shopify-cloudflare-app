import { describe, expect, it } from "vitest";

// A component that reads a namespace its route did not declare renders raw keys in the browser, because the server sends
// only the namespaces the MATCHED routes declare (`handle.i18n`). This reads the source: every namespace a route or a
// component uses must be declared by the routes that render it (its own handle plus its layout's; for a component, by
// EVERY route that imports it, directly or through other components).
const sources = import.meta.glob("../{routes,components}/**/*.{ts,tsx}", { eager: true, query: "?raw", import: "default" });

const files = Object.entries(sources).flatMap(([file, source]): [string, string][] =>
  typeof source === "string" && !/\.test\.tsx?$/.test(file) && !file.startsWith("../routes/internal/") && !file.startsWith("../routes/resources/") ? [[file, source]] : [],
);
const sourceOf = new Map(files);

function literals(text: string): string[] {
  return [...text.matchAll(/["']([\w-]+)["']/g)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

function declaredBy(source: string): string[] {
  const handle = /export const handle\s*=\s*\{\s*i18n:\s*(\[[^\]]*\]|["'][^"']*["'])/.exec(source)?.[1];
  return handle === undefined ? [] : literals(handle);
}

function usedBy(source: string): string[] {
  const hooks = [...source.matchAll(/useTranslation\(\s*(\[[^\]]*\]|["'][\w-]+["'])?\s*\)/g)].flatMap((match) => (match[1] === undefined ? ["common"] : literals(match[1])));
  const prefixed = [...source.matchAll(/\bt\(\s*[`"']([a-z][\w-]*):/g)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
  return [...new Set([...hooks, ...prefixed])];
}

function layoutOf(file: string): string | undefined {
  return ["../routes/public/", "../routes/app/"].map((dir) => `${dir}_layout.tsx`).find((layout) => file.startsWith(layout.replace("_layout.tsx", "")));
}

/** What a route declares for itself, with its layout's (a layout is always matched with its children). */
function routeNamespaces(file: string): Set<string> {
  const layout = layoutOf(file);
  return new Set([...declaredBy(sourceOf.get(file) ?? ""), ...(layout === undefined ? [] : declaredBy(sourceOf.get(layout) ?? ""))]);
}

function resolve(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("~/")
    ? `../${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? new URL(specifier, `file:///${from.replace(/[^/]*$/, "")}`).pathname.slice(1)
      : undefined;
  return base === undefined ? undefined : [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find((candidate) => sourceOf.has(candidate));
}

const importers = new Map<string, Set<string>>();
for (const [file, source] of files) {
  for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
    const target = match[1] === undefined ? undefined : resolve(file, match[1]);
    if (target !== undefined) importers.set(target, new Set([...(importers.get(target) ?? []), file]));
  }
}

/** The namespaces EVERY route that renders this file declares, or null when no route does (nothing to check against). */
function allowedFor(file: string, seen = new Set<string>()): Set<string> | null {
  if (file.startsWith("../routes/")) return routeNamespaces(file);
  if (seen.has(file)) return null;
  seen.add(file);
  const allowed = [...(importers.get(file) ?? [])].map((importer) => allowedFor(importer, seen)).filter((set): set is Set<string> => set !== null);
  const [first, ...rest] = allowed;
  return first === undefined ? null : new Set([...first].filter((namespace) => rest.every((set) => set.has(namespace))));
}

describe("a file reads only the namespaces its routes declare", () => {
  it("finds the routes and components to check (so the guard cannot pass by seeing nothing)", () => {
    expect(files.some(([file]) => file === "../routes/public/pricing.tsx")).toBe(true);
    expect(usedBy('const { t } = useTranslation(["admin", "common"]);')).toEqual(["admin", "common"]);
    expect(usedBy('t("common:plans.x")')).toEqual(["common"]);
    expect(declaredBy('export const handle = { i18n: ["common", "public"] };')).toEqual(["common", "public"]);
  });

  it("holds for every route and component", () => {
    const offenders = files.flatMap(([file, source]) => {
      const used = usedBy(source);
      if (used.length === 0) return [];
      const allowed = allowedFor(file);
      if (allowed === null) return [];
      return used.filter((namespace) => !allowed.has(namespace)).map((namespace) => `${file} uses "${namespace}", which its routes do not declare`);
    });
    expect(offenders).toEqual([]);
  });
});
