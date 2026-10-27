#!/usr/bin/env node
/**
 * Regenerate everything that is DERIVED from the translation folders.
 *
 *   node scripts/i18n-sync.mjs           # rewrite the generated files
 *   node scripts/i18n-sync.mjs --check   # exit 1 if any generated file is stale or a folder is malformed
 *
 * The source of truth is `app/i18n/locales/`:
 *   - `<code>/`: one folder per language, one JSON file per namespace, plus `language.json` (`{ "name": "<the language
 *     written in itself>" }` and nothing else). The folder name must be the canonical tag exactly as `Intl` writes it,
 *     with no extension, not `und`, and no two folders may be the same language, script and region once maximised
 *     (`zh` and `zh-CN` are one language). The SCRIPT and the DIRECTION of a language are never written by hand: they are
 *     generated here from `Intl` (`maximize().script`, `getTextInfo().direction`).
 *   - `namespaces.json`: every namespace and where it may go, `"browser"` or `"server"`. Declared, not inferred from a name.
 * Adding a language is adding a folder and running this script; no code file lists the codes.
 *
 * Every JSON file of every language is parsed (invalid JSON, a BOM or a non-object root fails the sync).
 *
 * Output:
 *   - app/i18n/catalogues.generated.ts: the codes, the default language, each language's name/script/direction, the
 *     namespaces and their kinds, the `Resources` type, the FLAT key union of each namespace (a plural group is its base
 *     key) and which keys are plural groups.
 *   - app/i18n/browser-loaders.generated.ts: one lazy import per language and BROWSER namespace (server namespaces such as
 *     `email` are never listed, so they cannot be emitted as public assets).
 *   - app/i18n/digests.generated.server.ts: SHA-256 of every default-language string (server only, `.server.ts`).
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

/** THE default language: generated into `DEFAULT_LANGUAGE`, and the key source every other language is checked against. */
export const DEFAULT_CODE = "en";
export const LANGUAGE_FILE = "language";
export const NAMESPACES_FILE = "namespaces.json";
export const LOCALES_DIR = "app/i18n/locales";
export const GENERATED_PATH = "app/i18n/catalogues.generated.ts";
export const LOADERS_PATH = "app/i18n/browser-loaders.generated.ts";
export const DIGESTS_PATH = "app/i18n/digests.generated.server.ts";

/** Bytes per locale file. Shopify documents 15 KB for a theme extension; UI extensions were observed to refuse a
 * pretty-printed file over about 30 KB (an app that hit it recorded that, not Shopify's docs). Both are kept a little
 * under the limit so a rounding of "KB" cannot matter. */
export const EXTENSION_LIMITS = Object.freeze({ theme: 15_000, ui: 29_600 });

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/** Parse one JSON file whose root must be an object. A BOM is refused by name: it is invisible and breaks other parsers. */
function readJson(path, problems) {
  try {
    const text = readFileSync(path, "utf8");
    if (text.startsWith("﻿")) {
      problems.push(`${path}: starts with a byte order mark; save it as UTF-8 without BOM`);
      return null;
    }
    const json = JSON.parse(text);
    if (!isObject(json)) {
      problems.push(`${path}: the root must be a JSON object`);
      return null;
    }
    return json;
  } catch (error) {
    problems.push(`${path}: not readable JSON (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

/** What is wrong with a folder name as a language code, or null. */
function codeProblem(code) {
  let locale;
  try {
    locale = new Intl.Locale(code);
  } catch {
    return `${code}: the folder name is not a well-formed BCP-47 tag`;
  }
  if (locale.language === "und") return `${code}: "und" is not a language`;
  if (locale.baseName !== code) {
    return `${code}: the folder name must be exactly "${locale.baseName}" (the canonical tag, no extensions, no underscores or odd casing)`;
  }
  return null;
}

/** The writing direction of a language, as `Intl` knows it. */
function directionOf(code) {
  const locale = new Intl.Locale(code).maximize();
  const info = typeof locale.getTextInfo === "function" ? locale.getTextInfo() : locale.textInfo;
  return info?.direction === "rtl" ? "rtl" : info?.direction === "ltr" ? "ltr" : null;
}

function readNamespaceKinds(base, problems) {
  const path = join(base, NAMESPACES_FILE);
  if (!existsSync(path)) {
    problems.push(`${path} is missing: declare every namespace as "browser" or "server"`);
    return null;
  }
  const kinds = readJson(path, problems);
  if (kinds === null) return null;
  for (const [namespace, kind] of Object.entries(kinds)) {
    if (kind !== "browser" && kind !== "server") problems.push(`${NAMESPACES_FILE}: "${namespace}" must be "browser" or "server"`);
  }
  return kinds;
}

/** One language folder: every file parsed, and its facts. */
function readLanguage(base, code, namespaces, problems) {
  const files = readdirSync(join(base, code)).filter((file) => file.endsWith(".json")).sort();
  const expected = [...namespaces.map((ns) => `${ns}.json`), `${LANGUAGE_FILE}.json`].sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) {
    problems.push(`${code}: files are [${files.join(", ")}], expected exactly [${expected.join(", ")}] (one JSON per namespace plus ${LANGUAGE_FILE}.json)`);
  }
  // EVERY file is parsed, so an invalid file in any language fails here and not at runtime.
  const parsed = Object.fromEntries(files.map((file) => [file, readJson(join(base, code, file), problems)]));
  const language = parsed[`${LANGUAGE_FILE}.json`];
  if (language === null || language === undefined) return null;
  const extra = Object.keys(language).filter((name) => name !== "name");
  if (typeof language.name !== "string" || language.name.trim() === "") {
    problems.push(`${code}/${LANGUAGE_FILE}.json: "name" (the language written in itself) is required`);
    return null;
  }
  if (extra.length > 0) {
    problems.push(`${code}/${LANGUAGE_FILE}.json: ${extra.map((name) => `"${name}"`).join(", ")} must be removed (the script and the direction are generated from Intl; only "name" is written)`);
    return null;
  }
  const direction = directionOf(code);
  if (direction === null) {
    problems.push(`${code}: this Node cannot tell the writing direction (Intl.Locale getTextInfo/textInfo)`);
    return null;
  }
  return { name: language.name, script: new Intl.Locale(code).maximize().script ?? "", direction };
}

/** Read the folders into a model, collecting every problem instead of stopping at the first. */
export function readCatalogues(root) {
  const problems = [];
  const base = join(root, LOCALES_DIR);
  if (!existsSync(base)) return { model: null, problems: [`${base} does not exist`] };

  const folders = readdirSync(base).filter((name) => statSync(join(base, name)).isDirectory());
  if (!folders.includes(DEFAULT_CODE)) problems.push(`the default language folder "${DEFAULT_CODE}" is missing`);
  const codes = [DEFAULT_CODE, ...folders.filter((code) => code !== DEFAULT_CODE).sort()].filter((code) => folders.includes(code));

  const kinds = readNamespaceKinds(base, problems) ?? {};
  const namespaces = existsSync(join(base, DEFAULT_CODE))
    ? readdirSync(join(base, DEFAULT_CODE))
        .filter((file) => file.endsWith(".json") && file !== `${LANGUAGE_FILE}.json`)
        .map((file) => file.slice(0, -".json".length))
        .sort()
    : [];
  const declared = Object.keys(kinds).sort();
  if (JSON.stringify(declared) !== JSON.stringify(namespaces)) {
    problems.push(`${NAMESPACES_FILE} declares [${declared.join(", ")}] but ${DEFAULT_CODE} has the namespace files [${namespaces.join(", ")}]`);
  }

  const languages = {};
  const maximised = new Map();
  for (const code of codes) {
    const problem = codeProblem(code);
    if (problem !== null) {
      problems.push(problem);
      continue;
    }
    const key = new Intl.Locale(code).maximize().toString();
    if (maximised.has(key)) problems.push(`${code}: is the same language, script and region as "${maximised.get(key)}"; keep one folder`);
    else maximised.set(key, code);
    const facts = readLanguage(base, code, namespaces, problems);
    if (facts !== null) languages[code] = facts;
  }
  const source = {};
  for (const ns of namespaces) {
    const path = join(base, DEFAULT_CODE, `${ns}.json`);
    const json = existsSync(path) ? readJson(path, []) : null;
    if (json !== null) source[ns] = leaves(json);
  }
  return { model: { codes, namespaces, kinds, languages, source }, problems };
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
/**
 * The keys of a namespace the way `t()` is typed: one entry per PLURAL GROUP, no category suffix. A group exists only
 * where an `_other` sibling does (every plural language has `other`), so a lone `status_one` stays a plain key.
 */
function keysOf(entries) {
  const all = new Set(entries.map(([key]) => key));
  const plural = new Set();
  const keys = new Set();
  for (const [key] of entries) {
    const base = PLURAL_SUFFIX.exec(key)?.[1];
    if (base !== undefined && all.has(`${base}_other`)) {
      plural.add(base);
      keys.add(base);
    } else keys.add(key);
  }
  return { keys: [...keys].sort(), plural: [...plural].sort() };
}
const digest = (text) => createHash("sha256").update(text, "utf8").digest("hex");

const q = JSON.stringify;
const typeName = (ns, suffix) => `${ns.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, _sep, c) => c.toUpperCase())}${suffix}`;
const ident = (ns) => `en_${ns.replace(/[^A-Za-z0-9]/g, "_")}`;
const union = (values) => (values.length === 0 ? "  never" : values.map((value) => `  | ${q(value)}`).join("\n"));

/** The generated TypeScript files, `{ path: content }`. Deterministic: the same folders always give the same bytes. */
export function renderGenerated(model) {
  const { codes, namespaces, kinds, languages, source } = model;
  const keyInfo = Object.fromEntries(namespaces.map((ns) => [ns, keysOf(source[ns] ?? [])]));
  const browser = namespaces.filter((ns) => kinds[ns] === "browser");
  const language = (code) => `  ${q(code)}: { name: ${q(languages[code].name)}, script: ${q(languages[code].script)}, direction: ${q(languages[code].direction)} },`;
  const catalogues = [
    "// GENERATED by scripts/i18n-sync.mjs from app/i18n/locales/. Do not edit: run `npm run i18n:sync`.",
    "// `npm run typecheck` runs the script with --check, so a stale copy of this file fails the build.",
    ...namespaces.map((ns) => `import type ${ident(ns)} from "./locales/${DEFAULT_CODE}/${ns}.json";`),
    "",
    "/** The default language: the key source, and the language of last resort. */",
    `export const DEFAULT_LANGUAGE = ${q(DEFAULT_CODE)} as const;`,
    "",
    "/** Every language folder under locales/, the default language first. */",
    `export const LANGUAGE_CODES = [${codes.map(q).join(", ")}] as const;`,
    "",
    "/** A language the app ships: the ONE type for a language, everywhere. */",
    "export type LanguageCode = (typeof LANGUAGE_CODES)[number];",
    "",
    "/** What each language is: its name written in itself (language.json), its script and its direction (both from Intl). */",
    `export const LANGUAGES = {\n${codes.map(language).join("\n")}\n} as const;`,
    "",
    "/** One JSON file per namespace in the default language's folder, and where each may go (namespaces.json). */",
    `export const NAMESPACE_KINDS = {\n${namespaces.map((ns) => `  ${q(ns)}: ${q(kinds[ns])},`).join("\n")}\n} as const;`,
    "",
    "export type Namespace = keyof typeof NAMESPACE_KINDS;",
    `export const NAMESPACES = [${namespaces.map(q).join(", ")}] as const;`,
    "",
    "/** The namespaces a browser may load: the ones declared \"browser\". */",
    `export const BROWSER_NAMESPACES = [${browser.map(q).join(", ")}] as const;`,
    "export type BrowserNamespace = (typeof BROWSER_NAMESPACES)[number];",
    "",
    "/** The default language is the key source: every other language is checked against it. */",
    "export type CatalogueResources = {",
    ...namespaces.map((ns) => `  ${q(ns)}: typeof ${ident(ns)};`),
    "};",
    "",
    "/** The keys of each namespace as t() takes them (flat; a plural group is its base key). */",
    ...namespaces.map((ns) => `export type ${typeName(ns, "Key")} =\n${union(keyInfo[ns].keys)};`),
    "",
    "export type CatalogueKeys = {",
    ...namespaces.map((ns) => `  ${q(ns)}: ${typeName(ns, "Key")};`),
    "};",
    "",
    "/** The keys that are plural groups (`items` for `items_one`, `items_other`...), so a unit must say so. */",
    ...namespaces.map((ns) => `export type ${typeName(ns, "PluralKey")} =\n${union(keyInfo[ns].plural)};`),
    "",
    "export type PluralKeys = {",
    ...namespaces.map((ns) => `  ${q(ns)}: ${typeName(ns, "PluralKey")};`),
    "};",
    "",
  ].join("\n");

  const loaders = [
    "// GENERATED by scripts/i18n-sync.mjs from app/i18n/locales/. Do not edit: run `npm run i18n:sync`.",
    '// One lazy import per language and BROWSER namespace: a namespace declared "server" in namespaces.json is not here.',
    "export const BROWSER_LOADERS = {",
    ...codes.flatMap((code) => [
      `  ${q(code)}: {`,
      ...browser.map((ns) => `    ${q(ns)}: () => import("./locales/${code}/${ns}.json"),`),
      "  },",
    ]),
    "} as const;",
    "",
  ].join("\n");

  const digests = [
    "// GENERATED by scripts/i18n-sync.mjs from app/i18n/locales/. Do not edit: run `npm run i18n:sync`.",
    "// Server only (the `.server.ts` suffix keeps it out of a browser bundle).",
    "/** SHA-256 (hex, of the UTF-8 text) of every default-language string, keyed `namespace:key`. */",
    "export const SOURCE_DIGESTS: Readonly<Record<string, string>> = {",
    ...namespaces.flatMap((ns) => (source[ns] ?? []).map(([key, text]) => `  ${q(`${ns}:${key}`)}: ${q(digest(text))},`)),
    "};",
    "",
  ].join("\n");

  return { [GENERATED_PATH]: catalogues, [LOADERS_PATH]: loaders, [DIGESTS_PATH]: digests };
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
    if (model.kinds[namespace] !== "server") {
      problems.push(`${NAMESPACES_FILE}: "${namespace}" feeds an extension's locale files, so it must be declared "server" (a browser must never load it)`);
      continue;
    }
    const limit = EXTENSION_LIMITS[extensionKind(dir)];
    for (const code of model.codes) {
      const source = readJson(join(root, LOCALES_DIR, code, `${namespace}.json`), problems);
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

  const outputs = Object.entries(renderGenerated(model)).map(([path, content]) => ({ path: join(root, path), content }));
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
