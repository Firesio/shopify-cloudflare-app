#!/usr/bin/env node
/**
 * Regenerate everything that is DERIVED from the translation folders.
 *
 *   node scripts/i18n-sync.mjs           # rewrite the generated files
 *   node scripts/i18n-sync.mjs --check   # exit 1 if any generated file is stale or a folder is malformed
 *
 * The source of truth is `app/i18n/locales/<code>/`: one folder per language, one JSON file per namespace, plus
 * `language.json` ({ "name": "<endonym>", "script": "Latn", "direction": "ltr" | "rtl" }; the script must be the one
 * `Intl.Locale(<code>).maximize()` gives, so a folder cannot claim a script it is not written in). Adding a language is adding a folder and running
 * this script; no code file lists the codes.
 *
 * Output:
 *   - app/i18n/catalogues.generated.ts: the codes, endonyms, scripts, directions, namespaces, the `Resources` type, the
 *     FLAT key union of each namespace (plural groups collapsed to the base key, as i18next types them) and a digest map
 *     (SHA-256 of every `en` string, for the "outdated" rule of an app's overrides: docs/i18n.md).
 *   - OPTIONAL, only when an `extensions/` folder exists: for every `extensions/<name>/locales/` folder, the locale files
 *     of that extension, one per catalogue language, taken from the namespace `ext-<name>` (so the app has one place
 *     for every string). The platform's size limit is checked; a file over it FAILS the sync (nothing is silently
 *     omitted). With no `extensions/` folder, or none with a `locales/` folder, this block does nothing.
 *
 * `--check` is part of `npm run typecheck`, so CI and the pre-commit gate fail on a stale generated file.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_CODE = "en";
export const LANGUAGE_FILE = "language";
export const GENERATED_PATH = "app/i18n/catalogues.generated.ts";

/** Bytes per locale file. Shopify documents 15 KB for a theme extension; UI extensions were observed to refuse a
 * pretty-printed file over about 30 KB (an app that hit it recorded that, not Shopify's docs). Both are kept a little
 * under the limit so a rounding of "KB" cannot matter. */
export const EXTENSION_LIMITS = Object.freeze({ theme: 15_000, ui: 29_600 });

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

function readJson(path, problems) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    problems.push(`${path}: not readable JSON (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

function isCanonicalTag(code) {
  try {
    return Intl.getCanonicalLocales(code)[0] === code;
  } catch {
    return false;
  }
}

/** Read the folders into a model, collecting every problem instead of stopping at the first. */
export function readCatalogues(root) {
  const problems = [];
  const base = join(root, "app/i18n/locales");
  if (!existsSync(base)) return { model: null, problems: [`${base} does not exist`] };

  const folders = readdirSync(base).filter((name) => statSync(join(base, name)).isDirectory());
  if (!folders.includes(DEFAULT_CODE)) problems.push(`the default language folder "${DEFAULT_CODE}" is missing`);
  const codes = [DEFAULT_CODE, ...folders.filter((code) => code !== DEFAULT_CODE).sort()].filter((code) => folders.includes(code));

  const namespaces = existsSync(join(base, DEFAULT_CODE))
    ? readdirSync(join(base, DEFAULT_CODE))
        .filter((file) => file.endsWith(".json") && file !== `${LANGUAGE_FILE}.json`)
        .map((file) => file.slice(0, -".json".length))
        .sort()
    : [];

  const names = {};
  const directions = {};
  const scripts = {};
  for (const code of codes) {
    if (!isCanonicalTag(code)) problems.push(`${code}: the folder name is not a canonical BCP-47 tag (use "pt-BR", not "pt_br")`);
    const files = readdirSync(join(base, code)).filter((file) => file.endsWith(".json")).sort();
    const expected = [...namespaces.map((ns) => `${ns}.json`), `${LANGUAGE_FILE}.json`].sort();
    if (JSON.stringify(files) !== JSON.stringify(expected)) {
      problems.push(`${code}: files are [${files.join(", ")}], expected exactly [${expected.join(", ")}] (one JSON per namespace plus ${LANGUAGE_FILE}.json)`);
    }
    const language = existsSync(join(base, code, `${LANGUAGE_FILE}.json`)) ? readJson(join(base, code, `${LANGUAGE_FILE}.json`), problems) : null;
    if (language === null) continue;
    if (!isObject(language) || typeof language.name !== "string" || language.name.trim() === "") {
      problems.push(`${code}/${LANGUAGE_FILE}.json: "name" (the language written in itself) is required`);
      continue;
    }
    if (language.direction !== "ltr" && language.direction !== "rtl") {
      problems.push(`${code}/${LANGUAGE_FILE}.json: "direction" must be "ltr" or "rtl"`);
      continue;
    }
    const maximal = isCanonicalTag(code) ? new Intl.Locale(code).maximize().script : undefined;
    if (typeof language.script !== "string" || language.script !== maximal) {
      problems.push(`${code}/${LANGUAGE_FILE}.json: "script" must be "${maximal}" (the script ${code} is written in)`);
      continue;
    }
    scripts[code] = language.script;
    names[code] = language.name;
    directions[code] = language.direction;
  }
  const source = {};
  for (const ns of namespaces) {
    const path = join(base, DEFAULT_CODE, `${ns}.json`);
    const json = existsSync(path) ? readJson(path, problems) : null;
    if (json !== null) source[ns] = leaves(json);
  }
  return { model: { codes, namespaces, names, scripts, directions, source }, problems };
}

/** Every string of a JSON file as [dotted key, text]. */
function leaves(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) => {
    if (typeof child === "string") return [[`${prefix}${key}`, child]];
    if (typeof child === "object" && child !== null) return leaves(child, `${prefix}${key}.`);
    return [];
  });
}

const PLURAL_SUFFIX = /^(.+)_(zero|one|two|few|many|other)$/;
/** Names a namespace's keys the way `t()` is typed: one entry per plural group, no category suffix. */
const INJECTED_KEYS = Object.freeze({ common: ["appName"] });
function flatKeys(ns, entries) {
  const keys = new Set(INJECTED_KEYS[ns] ?? []);
  for (const [key] of entries) keys.add(key.replace(PLURAL_SUFFIX, "$1"));
  return [...keys].sort();
}
const digest = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const q = JSON.stringify;
const keyTypeName = (ns) => `${ns.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, _sep, c) => c.toUpperCase())}Key`;
const ident = (ns) => `en_${ns.replace(/[^A-Za-z0-9]/g, "_")}`;

/** The generated TypeScript. Deterministic: the same folders always give the same bytes. */
export function renderGenerated(model) {
  const { codes, namespaces, names, scripts, directions, source } = model;
  const imports = namespaces.map((ns) => `import type ${ident(ns)} from "./locales/${DEFAULT_CODE}/${ns}.json";`);
  const record = (map) => codes.map((code) => `  ${q(code)}: ${q(map[code])},`).join("\n");
  return [
    "// GENERATED by scripts/i18n-sync.mjs from app/i18n/locales/. Do not edit: run `npm run i18n:sync`.",
    "// `npm run typecheck` runs the script with --check, so a stale copy of this file fails the build.",
    ...imports,
    "",
    "/** Every language folder under locales/, the default language first. */",
    `export const CATALOGUE_CODES = [${codes.map(q).join(", ")}] as const;`,
    "",
    "/** Each language written in itself (from its language.json). */",
    `export const LANGUAGE_NAMES = {\n${record(names)}\n} as const;`,
    "",
    "/** The script each language is written in (from each language.json, checked against Intl). */",
    `export const LANGUAGE_SCRIPTS = {\n${record(scripts)}\n} as const;`,
    "",
    "/** Writing direction (from each language.json). */",
    `export const LANGUAGE_DIRECTIONS = {\n${record(directions)}\n} as const;`,
    "",
    "/** One JSON file per namespace in the default language's folder. */",
    `export const CATALOGUE_NAMESPACES = [${namespaces.map(q).join(", ")}] as const;`,
    "",
    "/** The default language is the key source: every other language is checked against it. */",
    "export type CatalogueResources = {",
    ...namespaces.map((ns) => `  ${q(ns)}: typeof ${ident(ns)};`),
    "};",
    "",
    "/** The keys of each namespace as t() takes them (flat; a plural group is its base key). */",
    ...namespaces.map((ns) => `export type ${keyTypeName(ns)} =\n${flatKeys(ns, source[ns] ?? []).map((key) => `  | ${q(key)}`).join("\n") || "  never"};`),
    "",
    "export type CatalogueKeys = {",
    ...namespaces.map((ns) => `  ${q(ns)}: ${keyTypeName(ns)};`),
    "};",
    "",
    "/** SHA-256 (hex, of the UTF-8 text) of every default-language string, keyed `namespace:key`. */",
    "export const SOURCE_DIGESTS: Readonly<Record<string, string>> = {",
    ...namespaces.flatMap((ns) => (source[ns] ?? []).map(([key, text]) => `  ${q(`${ns}:${key}`)}: ${q(digest(text))},`)),
    "};",
    "",
  ].join("\n");
}

/** Which size limit applies to an extension, read from its toml (a theme extension is stricter). */
function extensionKind(extensionDir) {
  const tomlPath = join(extensionDir, "shopify.extension.toml");
  if (!existsSync(tomlPath)) return "ui";
  return /^\s*type\s*=\s*"theme"/m.test(readFileSync(tomlPath, "utf8")) ? "theme" : "ui";
}

/** The locale files every extension with a `locales/` folder should hold, from its `ext-<name>` namespace. */
export function planExtensionFiles(root, model) {
  const problems = [];
  const files = [];
  const extensionsDir = join(root, "extensions");
  if (!existsSync(extensionsDir)) return { files, problems };

  for (const name of readdirSync(extensionsDir).sort()) {
    const dir = join(extensionsDir, name);
    if (!statSync(dir).isDirectory() || !existsSync(join(dir, "locales"))) continue;
    const namespace = `ext-${name}`;
    if (!model.namespaces.includes(namespace)) {
      problems.push(`extensions/${name}/locales exists but there is no namespace file "${namespace}.json" to generate it from`);
      continue;
    }
    const limit = EXTENSION_LIMITS[extensionKind(dir)];
    for (const code of model.codes) {
      const source = readJson(join(root, "app/i18n/locales", code, `${namespace}.json`), problems);
      if (source === null) continue;
      const content = `${JSON.stringify(source, null, 2)}\n`;
      const bytes = Buffer.byteLength(content);
      const file = join(dir, "locales", code === DEFAULT_CODE ? `${code}.default.json` : `${code}.json`);
      if (bytes > limit) {
        problems.push(`${file}: ${bytes} bytes is over the ${limit} byte limit for this extension; shorten ${namespace}.json (nothing is omitted automatically)`);
        continue;
      }
      files.push({ path: file, content });
    }
  }
  return { files, problems };
}

function currentContent(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Sync (or check) one repository root. Returns what changed and every problem found. */
export function sync({ root, check }) {
  const { model, problems } = readCatalogues(root);
  if (model === null || problems.length > 0) return { changed: [], problems };

  const outputs = [{ path: join(root, GENERATED_PATH), content: renderGenerated(model) }];
  const extensions = planExtensionFiles(root, model);
  problems.push(...extensions.problems);
  outputs.push(...extensions.files);
  if (problems.length > 0) return { changed: [], problems };

  const changed = outputs.filter((output) => currentContent(output.path) !== output.content);
  if (!check) {
    for (const output of changed) {
      mkdirSync(dirname(output.path), { recursive: true });
      writeFileSync(output.path, output.content);
    }
  }
  return { changed: changed.map((output) => output.path), problems };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const check = process.argv.includes("--check");
  const { changed, problems } = sync({ root, check });
  for (const problem of problems) console.error(`i18n-sync: ${problem}`);
  if (problems.length > 0) process.exit(1);
  if (check && changed.length > 0) {
    console.error(`i18n-sync: stale generated file(s), run \`npm run i18n:sync\`:\n  ${changed.join("\n  ")}`);
    process.exit(1);
  }
  console.log(check ? "i18n-sync: up to date" : `i18n-sync: ${changed.length} file(s) written`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
