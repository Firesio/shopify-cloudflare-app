import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sync } from "../../scripts/i18n-sync.mjs";
import { buildLoaders, buildResources, loadBundles } from "./catalogue-modules";
import { CATALOGUE_CODES, CATALOGUE_NAMESPACES } from "./catalogues.generated";
import { NAMESPACES, SUPPORTED_LOCALES } from "./config";
import { resources } from "./resources";

const repoRoot = join(import.meta.dirname, "../..");

describe("the generated catalogue file", () => {
  it("is current, and every language folder is well formed (run `npm run i18n:sync`)", () => {
    const result = sync({ root: repoRoot, check: true });
    expect(result.problems).toEqual([]);
    expect(result.changed).toEqual([]);
  });

  it("lists the same languages and namespaces the resources hold", () => {
    expect([...SUPPORTED_LOCALES]).toEqual([...CATALOGUE_CODES]);
    expect([...NAMESPACES]).toEqual([...CATALOGUE_NAMESPACES]);
    expect(Object.keys(resources).sort()).toEqual([...CATALOGUE_CODES].sort());
    for (const code of CATALOGUE_CODES) expect(Object.keys(resources[code] ?? {}).sort(), code).toEqual([...CATALOGUE_NAMESPACES].sort());
  });

  it("never carries appName in a JSON file: it is injected", () => {
    for (const code of CATALOGUE_CODES) {
      const common = JSON.parse(readFileSync(join(repoRoot, "app/i18n/locales", code, "common.json"), "utf8"));
      expect(common, code).not.toHaveProperty("appName");
      expect(resources[code]?.common, code).toHaveProperty("appName");
    }
  });
});

const PLURAL_SUFFIX = /^(.+)_(zero|one|two|few|many|other)$/;

describe("plural keys", () => {
  it("have exactly the categories Intl.PluralRules gives each language", () => {
    const problems: string[] = [];
    for (const code of CATALOGUE_CODES) {
      const wanted = new Intl.PluralRules(code).resolvedOptions().pluralCategories.sort();
      for (const ns of CATALOGUE_NAMESPACES) {
        const groups = new Map<string, string[]>();
        const walk = (value: object, path: string): void => {
          for (const [key, child] of Object.entries(value)) {
            if (typeof child === "object" && child !== null) walk(child, `${path}${key}.`);
            const match = PLURAL_SUFFIX.exec(key);
            if (typeof child === "string" && match?.[1] !== undefined && match[2] !== undefined) {
              groups.set(`${path}${match[1]}`, [...(groups.get(`${path}${match[1]}`) ?? []), match[2]]);
            }
          }
        };
        walk(resources[code]?.[ns] ?? {}, "");
        for (const [base, found] of groups) {
          if (JSON.stringify(found.sort()) !== JSON.stringify(wanted)) problems.push(`${code}/${ns} ${base}: has [${found}], needs [${wanted}]`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

const sources = import.meta.glob("../**/*.{ts,tsx}", { eager: true, query: "?raw", import: "default" });

describe("no language code is written in code", () => {
  const codes = CATALOGUE_CODES.map((code) => code.replace("-", "\\-")).join("|");
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

  function fixture(): string {
    const root = mkdtempSync(join(tmpdir(), "i18n-proof-"));
    dirs.push(root);
    const put = (path: string, value: unknown) => {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), JSON.stringify(value));
    };
    for (const [code, name, direction, hello] of [["en", "English", "ltr", "Hello"], ["fr", "Français", "ltr", "Bonjour"], ["ar", "العربية", "rtl", "مرحبا"]] as const) {
      put(`app/i18n/locales/${code}/language.json`, { name, direction });
      put(`app/i18n/locales/${code}/common.json`, { hello });
      put(`app/i18n/locales/${code}/ext-checkout.json`, { hello });
    }
    mkdirSync(join(root, "extensions/checkout/locales"), { recursive: true });
    return root;
  }

  it("appears in the generated catalogue list, resources, browser loaders and extension locale files", async () => {
    const root = fixture();
    const result = sync({ root, check: false });
    expect(result.problems).toEqual([]);

    const generated = readFileSync(join(root, "app/i18n/catalogues.generated.ts"), "utf8");
    expect(generated).toContain('CATALOGUE_CODES = ["en", "ar", "fr"]');
    expect(generated).toContain('"ar": "rtl"');
    expect(generated).toContain('"fr": "Français"');

    const files = readdirSync(join(root, "extensions/checkout/locales")).sort();
    expect(files).toEqual(["ar.json", "en.default.json", "fr.json"]);

    const modules: Record<string, unknown> = {};
    const lazy: Record<string, () => Promise<unknown>> = {};
    const base = join(root, "app/i18n/locales");
    for (const code of readdirSync(base).filter((name) => statSync(join(base, name)).isDirectory())) {
      for (const file of readdirSync(join(base, code))) {
        const key = `./locales/${code}/${file}`;
        const json = JSON.parse(readFileSync(join(base, code, file), "utf8"));
        modules[key] = { default: json };
        lazy[key] = () => Promise.resolve({ default: json });
      }
    }
    expect(buildResources(modules).fr?.common).toEqual({ hello: "Bonjour" });
    expect(Object.keys(buildResources(modules)).sort()).toEqual(["ar", "en", "fr"]);
    const loaded = await loadBundles(buildLoaders(lazy), ["fr"], ["common"]);
    expect(loaded).toEqual({ fr: { common: { hello: "Bonjour" } } });

    expect(sync({ root, check: true }).changed).toEqual([]);
  });

  it("fails the check when the generated file is stale or a folder is missing a file", () => {
    const root = fixture();
    sync({ root, check: false });
    writeFileSync(join(root, "app/i18n/locales/fr/extra.json"), "{}");
    expect(sync({ root, check: true }).problems.join("\n")).toContain("fr: files are");
  });

  it("refuses an extension locale file over the platform limit instead of omitting strings", () => {
    const root = fixture();
    writeFileSync(join(root, "app/i18n/locales/fr/ext-checkout.json"), JSON.stringify({ hello: "x".repeat(30_000) }));
    expect(sync({ root, check: false }).problems.join("\n")).toContain("over the 29600 byte limit");
  });

  it("does nothing for extensions when there is no extensions folder", () => {
    const root = fixture();
    rmSync(join(root, "extensions"), { recursive: true });
    expect(sync({ root, check: false }).problems).toEqual([]);
    expect(() => statSync(join(root, "extensions"))).toThrow();
  });
});
