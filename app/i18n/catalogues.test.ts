import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sync } from "../../scripts/i18n-sync.mjs";
import { buildResources } from "./catalogue-modules";
import { BROWSER_NAMESPACES, LANGUAGE_CODES, NAMESPACES } from "./catalogues.generated";
import { resources } from "./resources";

const repoRoot = join(import.meta.dirname, "../..");

describe("the generated catalogue file", () => {
  it("is current, and every language folder is well formed (run `npm run i18n:sync`)", () => {
    const result = sync({ root: repoRoot, check: true });
    expect(result.problems).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it("lists the same languages and namespaces the resources hold", () => {
    expect(Object.keys(resources).sort()).toEqual([...LANGUAGE_CODES].sort());
    for (const code of LANGUAGE_CODES) expect(Object.keys(resources[code] ?? {}).sort(), code).toEqual([...NAMESPACES].sort());
  });

  it("never carries appName in a JSON file or in the resources: it is a default variable", () => {
    for (const code of LANGUAGE_CODES) {
      const common = JSON.parse(readFileSync(join(repoRoot, "app/i18n/locales", code, "common.json"), "utf8"));
      expect(common, code).not.toHaveProperty("appName");
      expect(resources[code]?.common, code).not.toHaveProperty("appName");
    }
  });

  it("freezes the shared resources, so no request can change them for another shop", () => {
    for (const code of LANGUAGE_CODES) {
      expect(Object.isFrozen(resources[code]), code).toBe(true);
      for (const ns of NAMESPACES) expect(Object.isFrozen(resources[code]?.[ns]), `${code}/${ns}`).toBe(true);
    }
  });
});

describe("browser namespaces", () => {
  it("are exactly the ones namespaces.json declares browser, and the generated loaders list no other", () => {
    const loaders = readFileSync(join(repoRoot, "app/i18n/browser-loaders.generated.ts"), "utf8");
    expect(loaders).not.toContain("email.json");
    for (const code of LANGUAGE_CODES) for (const ns of BROWSER_NAMESPACES) expect(loaders).toContain(`import("./locales/${code}/${ns}.json")`);
    expect(loaders.match(/import\(/g)?.length).toBe(LANGUAGE_CODES.length * BROWSER_NAMESPACES.length);
  });
});

const PLURAL_SUFFIX = /^(.+)_(zero|one|two|few|many|other)$/;

/** Plural groups the way the generator finds them: a base is plural only when its `_other` form exists. */
function pluralGroups(value: object, path = ""): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const entries = Object.entries(value);
  const names = new Set(entries.map(([key]) => key));
  for (const [key, child] of entries) {
    if (typeof child === "object" && child !== null) {
      for (const [base, categories] of pluralGroups(child, `${path}${key}.`)) found.set(base, categories);
      continue;
    }
    const match = PLURAL_SUFFIX.exec(key);
    if (typeof child === "string" && match?.[1] !== undefined && match[2] !== undefined && names.has(`${match[1]}_other`)) {
      found.set(`${path}${match[1]}`, [...(found.get(`${path}${match[1]}`) ?? []), match[2]]);
    }
  }
  return found;
}

describe("plural keys", () => {
  it("have exactly the categories Intl.PluralRules gives each language", () => {
    const problems: string[] = [];
    for (const code of LANGUAGE_CODES) {
      const wanted = new Intl.PluralRules(code).resolvedOptions().pluralCategories.sort();
      for (const ns of NAMESPACES) {
        for (const [base, found] of pluralGroups(resources[code]?.[ns] ?? {})) {
          if (JSON.stringify(found.sort()) !== JSON.stringify(wanted)) problems.push(`${code}/${ns} ${base}: has [${found}], needs [${wanted}]`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
  it("are the same groups in every language", () => {
    for (const ns of NAMESPACES) {
      const base = [...pluralGroups(resources.en?.[ns] ?? {}).keys()].sort();
      for (const code of LANGUAGE_CODES) expect([...pluralGroups(resources[code]?.[ns] ?? {}).keys()].sort(), `${code}/${ns}`).toEqual(base);
    }
  });
});

const sources = import.meta.glob("../**/*.{ts,tsx}", { eager: true, query: "?raw", import: "default" });

describe("no language code is written in code", () => {
  const codes = LANGUAGE_CODES.map((code) => code.replace("-", "\\-")).join("|");
  const list = new RegExp(`\\[\\s*["'](?:${codes})["']\\s*,\\s*["'](?:${codes})["']`);
  const prefix = new RegExp(`(?:startsWith|endsWith)\\(\\s*["'](?:${codes})["']`);

  it("has no list of codes and no startsWith on a code outside the generated file and the locale folders", () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !/\.test\.tsx?$/.test(file) && !file.endsWith("catalogues.generated.ts"))
      .filter(([, source]) => typeof source === "string" && (list.test(source) || prefix.test(source)))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});

describe("generic language modules", () => {
  it("import nothing app-specific", () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => file.startsWith("../lib/language/") && !/\.test\.tsx?$/.test(file))
      .filter(([, source]) => typeof source === "string" && /from\s+["'](?:~\/|\.\.\/)/.test(source))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});

describe("a new language folder needs no edit anywhere (temp folder proof)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  type Fixture = { readonly root: string; put(path: string, value: unknown): void; putText(path: string, text: string): void };

  function fixture(languages: readonly (readonly [string, string, string])[] = [["en", "English", "Hello"], ["fr", "Français", "Bonjour"], ["ar", "العربية", "مرحبا"]]): Fixture {
    const root = mkdtempSync(join(tmpdir(), "i18n-proof-"));
    dirs.push(root);
    const putText = (path: string, text: string) => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    const put = (path: string, value: unknown) => putText(path, JSON.stringify(value));
    put("app/i18n/locales/namespaces.json", { common: "browser", "ext-checkout": "server" });
    for (const [code, name, hello] of languages) {
      put(`app/i18n/locales/${code}/language.json`, { name });
      put(`app/i18n/locales/${code}/common.json`, { hello });
      put(`app/i18n/locales/${code}/ext-checkout.json`, { hello });
    }
    mkdirSync(join(root, "extensions/checkout/locales"), { recursive: true });
    return { root, put, putText };
  }

  it("appears in the generated catalogue list, resources, browser loaders and extension locale files", () => {
    const { root } = fixture();
    const result = sync({ root, check: false });
    expect(result.problems).toEqual([]);

    const generated = readFileSync(join(root, "app/i18n/catalogues.generated.ts"), "utf8");
    expect(generated).toContain('LANGUAGE_CODES = ["en", "ar", "fr"]');
    expect(generated).toContain('"ar": { name: "العربية", script: "Arab", direction: "rtl" }');
    expect(generated).toContain('"fr": { name: "Français", script: "Latn", direction: "ltr" }');
    expect(generated).toContain('export type CommonKey =\n  | "hello"');
    expect(generated).toContain('"ext-checkout": "server"');
    expect(readFileSync(join(root, "app/i18n/digests.generated.server.ts"), "utf8")).toContain('"common:hello":');

    // The browser loads `common` per language, and `ext-checkout` (a server namespace) is not even listed.
    const loaders = readFileSync(join(root, "app/i18n/browser-loaders.generated.ts"), "utf8");
    expect(loaders).toContain('import("./locales/fr/common.json")');
    expect(loaders).not.toContain("ext-checkout");

    expect(readdirSync(join(root, "extensions/checkout/locales")).sort()).toEqual(["ar.json", "en.default.json", "fr.json"]);

    const modules: Record<string, unknown> = {};
    const base = join(root, "app/i18n/locales");
    for (const code of readdirSync(base).filter((name) => statSync(join(base, name)).isDirectory())) {
      for (const file of readdirSync(join(base, code))) modules[`./locales/${code}/${file}`] = { default: JSON.parse(readFileSync(join(base, code, file), "utf8")) };
    }
    expect(buildResources(modules).fr?.common).toEqual({ hello: "Bonjour" });
    expect(Object.keys(buildResources(modules)).sort()).toEqual(["ar", "en", "fr"]);

    expect(sync({ root, check: true }).changed).toEqual([]);
  });

  it("generates the script and the direction from Intl, so a language.json cannot claim them", () => {
    const { root, put } = fixture();
    put("app/i18n/locales/ar/language.json", { name: "العربية", script: "Latn", direction: "ltr" });
    const problems = sync({ root, check: false }).problems.join("\n");
    expect(problems).toContain("ar/language.json");
    expect(problems).toContain('"script", "direction" must be removed');
  });

  it("fails the check when a folder is missing a file", () => {
    const { root, put } = fixture();
    sync({ root, check: false });
    put("app/i18n/locales/fr/extra.json", {});
    expect(sync({ root, check: true }).problems.join("\n")).toContain("fr: files are");
  });

  it("parses EVERY file of EVERY language: invalid JSON, a BOM and a non-object root fail the sync", () => {
    const a = fixture();
    a.putText("app/i18n/locales/fr/common.json", "{ not json");
    expect(sync({ root: a.root, check: false }).problems.join("\n")).toContain("fr/common.json: not readable JSON");

    const b = fixture();
    b.putText("app/i18n/locales/ar/ext-checkout.json", `\uFEFF${JSON.stringify({ hello: "x" })}`);
    expect(sync({ root: b.root, check: false }).problems.join("\n")).toContain("byte order mark");

    const c = fixture();
    c.put("app/i18n/locales/fr/common.json", ["not", "an", "object"]);
    expect(sync({ root: c.root, check: false }).problems.join("\n")).toContain("the root must be a JSON object");
  });

  it("refuses a folder name that is not exactly the canonical tag, und, or the same language twice", () => {
    for (const [name, expected] of [
      ["pt_BR", "not a well-formed BCP-47 tag"],
      ["PT-br", "must be exactly \"pt-BR\""],
      ["es-u-ca-gregory", "must be exactly \"es\""],
      ["und", "\"und\" is not a language"],
    ] as const) {
      const { root } = fixture([["en", "English", "Hello"], [name, "X", "Hola"]]);
      expect(sync({ root, check: false }).problems.join("\n"), name).toContain(expected);
    }
    const twice = fixture([["en", "English", "Hello"], ["zh", "中文", "你好"], ["zh-CN", "中文（中国）", "你好"]]);
    expect(sync({ root: twice.root, check: false }).problems.join("\n")).toContain("same language, script and region");
    const enUs = fixture([["en", "English", "Hello"], ["en-US", "English (US)", "Hello"]]);
    expect(sync({ root: enUs.root, check: false }).problems.join("\n")).toContain("same language, script and region");
  });

  it("declares every namespace's kind; an undeclared or misdeclared one fails", () => {
    const { root, put } = fixture();
    put("app/i18n/locales/namespaces.json", { common: "browser" });
    expect(sync({ root, check: false }).problems.join("\n")).toContain("namespaces.json declares [common]");
    put("app/i18n/locales/namespaces.json", { common: "browser", "ext-checkout": "browser" });
    expect(sync({ root, check: false }).problems.join("\n")).toContain('"ext-checkout" feeds an extension\'s locale files, so it must be declared "server"');
    put("app/i18n/locales/namespaces.json", { common: "everywhere", "ext-checkout": "server" });
    expect(sync({ root, check: false }).problems.join("\n")).toContain('"common" must be "browser" or "server"');
  });

  it("finds a plural group only where `_other` exists, and types it", () => {
    const { root, put } = fixture();
    put("app/i18n/locales/en/common.json", { items_one: "{{count}} item", items_other: "{{count}} items", status_one: "lone", hello: "Hi" });
    for (const code of ["fr", "ar"]) put(`app/i18n/locales/${code}/common.json`, { items_one: "x", items_other: "x", status_one: "x", hello: "x" });
    expect(sync({ root, check: false }).problems).toEqual([]);
    const generated = readFileSync(join(root, "app/i18n/catalogues.generated.ts"), "utf8");
    expect(generated).toContain('export type CommonKey =\n  | "hello"\n  | "items"\n  | "status_one"');
    expect(generated).toContain('export type CommonPluralKey =\n  | "items"');
  });

  it("refuses an extension locale file over the platform limit instead of omitting strings", () => {
    const { root, put } = fixture();
    put("app/i18n/locales/fr/ext-checkout.json", { hello: "x".repeat(30_000) });
    expect(sync({ root, check: false }).problems.join("\n")).toContain("over the 29600 byte limit");
  });

  it("does nothing for extensions when there is no extensions folder", () => {
    const { root } = fixture();
    rmSync(join(root, "extensions"), { recursive: true });
    expect(sync({ root, check: false }).problems).toEqual([]);
    expect(() => statSync(join(root, "extensions"))).toThrow();
  });
});

describe("generated digests (a server-only extension point)", () => {
  it("has a digest for every en string, and the digest is SHA-256 of the text", async () => {
    const { SOURCE_DIGESTS } = await import("./digests.generated.server");
    const text = "This email was sent by {{appName}} support.";
    const bytes = new TextEncoder().encode(text);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
    expect(SOURCE_DIGESTS["email:senderDisclosure"]).toBe(hash);
  });
});
