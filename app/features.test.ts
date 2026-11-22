import type { RouteConfigEntry } from "@react-router/dev/routes";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { phoneItems } from "~/components/phone-items";
import { I18N } from "~/i18n";
import { navLabelsOf } from "~/i18n/labels";
import { PHONE_DEVICES, PHONE_PATHS } from "~/core/phone";
import { PWA } from "~/core/features";
import { PHONE_ROUTE_FILES } from "./routes/phone-routes";

const APP = import.meta.dirname;
const ROOT = path.join(APP, "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** The route files of a table, wherever they sit in it. */
function filesOf(entries: readonly RouteConfigEntry[]): string[] {
  return entries.flatMap((entry) => [entry.file, ...filesOf(entry.children ?? [])]);
}

/** `app/routes.ts` as it mounts the routes while the switch is `pwa`: the file is loaded again with that value. */
async function mountedWith(pwa: boolean): Promise<string[]> {
  vi.resetModules();
  vi.doMock("~/core/features", () => ({ PWA: pwa }));
  const table = await import("~/routes");
  return filesOf(table.default);
}

/** Everything the switch is held against, as data, so a test can show what each finding says on a state that is wrong on purpose. */
interface Wiring {
  readonly pwa: boolean;
  readonly mounted: readonly string[];
  readonly firesioSource: string;
  readonly layoutSource: string;
  readonly wranglerSource: string;
  readonly drizzleSource: string;
  readonly fileExists: (file: string) => boolean;
}

const GUARDED_DEVICES = /PWA\s*\?\s*\{\s*devices:\s*PHONE_DEVICES\s*\}/g;
const DEVICES_OPTION = /\bdevices\s*:/g;
const GUARDED_LAZY = /PWA\s*\?\s*lazy\(\s*\(\)\s*=>\s*import\(\s*"~\/components\/PhoneLayout"\s*\)\s*\)/;

/**
 * What is wrong with the staff phone app's wiring, in words that say what to change. Empty when it is right for the switch's value: ON needs
 * every piece connected, OFF needs none (so a switched-off part costs nothing), and the pieces that are always there must be there either way.
 */
export function phoneFindings(wiring: Wiring): string[] {
  const findings: string[] = [];
  const on = wiring.pwa;
  for (const file of PHONE_ROUTE_FILES) {
    if (!wiring.fileExists(path.join("app", file))) findings.push(`app/${file} is missing: it is one of the phone app's routes (docs/POS-AND-PHONE.md section 3)`);
    else if (on && !wiring.mounted.includes(file)) findings.push(`PWA is on (app/core/features.ts) but app/routes.ts does not mount ${file}`);
    else if (!on && wiring.mounted.includes(file)) findings.push(`PWA is off (app/core/features.ts) but app/routes.ts still mounts ${file}: connect it only through the switch`);
  }
  const declared = (wiring.firesioSource.match(DEVICES_OPTION) ?? []).length;
  const guarded = (wiring.firesioSource.match(GUARDED_DEVICES) ?? []).length;
  if (declared > guarded) findings.push("app/firesio.server.ts declares `devices` outside `...(PWA ? { devices: PHONE_DEVICES } : {})`: the phone gate would be on whatever the switch says");
  if (on && guarded === 0) findings.push("PWA is on (app/core/features.ts) but app/firesio.server.ts does not declare `devices: PHONE_DEVICES` (the device gate, `firesio.devices()` and the daily sweep need it)");
  if (/from\s+["']~\/components\/PhoneLayout["']/.test(wiring.layoutSource) || /@firesio\/app\/ui\/devices/.test(wiring.layoutSource)) {
    findings.push("app/routes/app/layout.tsx imports the phone shell statically: load it with `PWA ? lazy(() => import(\"~/components/PhoneLayout\")) : null`, or its code ships in the admin's bundle while the part is off");
  }
  if (!GUARDED_LAZY.test(wiring.layoutSource)) findings.push("app/routes/app/layout.tsx does not load the phone shell with `PWA ? lazy(() => import(\"~/components/PhoneLayout\")) : null`");
  if ((wiring.wranglerSource.match(/"DEVICE_LINK_LIMITER"/g) ?? []).length < 2) findings.push("wrangler.jsonc must declare the DEVICE_LINK_LIMITER rate limit at the top level AND under env.production (bindings are not inherited)");
  if (!wiring.drizzleSource.includes("@firesio/app/src/devices/d1/schema.ts")) findings.push("drizzle.config.ts must list @firesio/app/src/devices/d1/schema.ts, so the three device tables are in the migration history before the switch is turned on");
  for (const icon of PHONE_DEVICES.manifest?.icons ?? []) {
    if (!wiring.fileExists(path.join("public", icon.src))) findings.push(`the manifest names ${icon.src} but public${icon.src} does not exist`);
  }
  return findings;
}

const real = async (pwa: boolean): Promise<Wiring> => ({
  pwa,
  mounted: await mountedWith(pwa),
  firesioSource: read("app/firesio.server.ts"),
  layoutSource: read("app/routes/app/layout.tsx"),
  wranglerSource: read("wrangler.jsonc"),
  drizzleSource: read("drizzle.config.ts"),
  fileExists: (file) => existsSync(path.join(ROOT, file)),
});

afterEach(() => vi.doUnmock("~/core/features"));

describe("PWA: the switch against the pieces", () => {
  it("is wired right for the value it has in app/core/features.ts", async () => {
    expect(phoneFindings(await real(PWA))).toEqual([]);
  });

  it("mounts every piece when on, and none when off", async () => {
    const on = await mountedWith(true);
    const off = await mountedWith(false);
    for (const file of PHONE_ROUTE_FILES) {
      expect(on).toContain(file);
      expect(off).not.toContain(file);
    }
    expect(phoneFindings(await real(true))).toEqual([]);
    expect(phoneFindings(await real(false))).toEqual([]);
  });
});

describe("PWA: what the findings say", () => {
  it("names what is missing when the switch is on and a piece is not connected", async () => {
    const wiring = await real(true);
    const without = (file: string) => ({ ...wiring, mounted: wiring.mounted.filter((mounted) => mounted !== file) });
    expect(phoneFindings(without("routes/sw.ts"))).toEqual(["PWA is on (app/core/features.ts) but app/routes.ts does not mount routes/sw.ts"]);
    expect(phoneFindings({ ...wiring, firesioSource: wiring.firesioSource.replace("...(PWA ? { devices: PHONE_DEVICES } : {}),", "") }).join("\n")).toContain("does not declare `devices: PHONE_DEVICES`");
    expect(phoneFindings({ ...wiring, wranglerSource: wiring.wranglerSource.replace(/"DEVICE_LINK_LIMITER"/, '"OTHER"') }).join("\n")).toContain("DEVICE_LINK_LIMITER");
  });

  it("names a file that is not there, whichever way the switch points", async () => {
    const wiring = await real(true);
    const missing = (name: string) => ({ ...wiring, fileExists: (file: string) => !file.endsWith(name) && wiring.fileExists(file) });
    expect(phoneFindings(missing("phone-icon-512.png")).join("\n")).toContain("public/phone-icon-512.png does not exist");
    expect(phoneFindings(missing(path.join("m", "link-poll.ts"))).join("\n")).toContain("app/routes/m/link-poll.ts is missing");
  });

  it("names what is still connected when the switch is off", async () => {
    const wiring = await real(false);
    const stray = { ...wiring, mounted: [...wiring.mounted, "routes/m/manifest.ts"] };
    expect(phoneFindings(stray)).toEqual(["PWA is off (app/core/features.ts) but app/routes.ts still mounts routes/m/manifest.ts: connect it only through the switch"]);
    const loose = { ...wiring, firesioSource: wiring.firesioSource.replace("...(PWA ? { devices: PHONE_DEVICES } : {}),", "devices: PHONE_DEVICES,") };
    expect(phoneFindings(loose).join("\n")).toContain("outside `...(PWA ? { devices: PHONE_DEVICES } : {})`");
    const eager = { ...wiring, layoutSource: `import PhoneLayout from "~/components/PhoneLayout";\n${wiring.layoutSource}` };
    expect(phoneFindings(eager).join("\n")).toContain("imports the phone shell statically");
  });
});

describe("the phone app's own settings", () => {
  it("are coherent: its addresses are the package's defaults, its bar is short", () => {
    expect(PHONE_PATHS).toMatchObject({ install: "/m", start: "/m/start", startApi: "/m/api/link/start", pollApi: "/m/api/link/poll", manage: "/app/phone" });
    expect(phoneItems(navLabelsOf(I18N.translator("en"))).length).toBeLessThanOrEqual(5);
  });

  it("deny-list names real /app routes, and each icon is the size it says", async () => {
    const appRoutes = (await mountedWith(true)).filter((file) => file.startsWith("routes/app/"));
    for (const { prefix } of PHONE_DEVICES.denied) expect(appRoutes.some((file) => file.startsWith(`routes/app/${prefix}`)), `denied prefix "${prefix}" matches no /app route`).toBe(true);
    for (const icon of PHONE_DEVICES.manifest?.icons ?? []) {
      const header = readFileSync(path.join(ROOT, "public", icon.src));
      expect(`${header.readUInt32BE(16)}x${header.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  });
});
