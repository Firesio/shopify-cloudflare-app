// The browser's i18n start-up, in jsdom. The only thing replaced is the network: the lazy chunk loaders (a dynamic `import`
// of a file the page would download), so a failed download can be staged.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BOOTSTRAP_GLOBAL } from "./bootstrap";
import { bootstrapFor } from "./bootstrap.server";

afterEach(() => {
  Reflect.deleteProperty(window, BOOTSTRAP_GLOBAL);
  document.documentElement.lang = "";
  vi.resetModules();
  vi.doUnmock("./browser-loaders.generated");
});

async function freshClient() {
  vi.resetModules();
  return (await import("./i18n.client")).initClientI18n();
}

describe("initClientI18n", () => {
  it("hydrates from what the server put in the page, with no download", async () => {
    vi.doMock("./browser-loaders.generated", () => ({ BROWSER_LOADERS: new Proxy({}, { get: () => { throw new Error("downloaded a chunk"); } }) }));
    Reflect.set(window, BOOTSTRAP_GLOBAL, bootstrapFor("es", ["common", "public"]));
    const i18n = await freshClient();
    expect(i18n.language).toBe("es");
    expect(i18n.t("nav.pricing", { ns: "common" })).toBe("Precios");
    expect(i18n.hasResourceBundle("es", "admin")).toBe(false);
    expect(i18n.hasResourceBundle("en", "common")).toBe(false); // English is not loaded "just in case"
  });

  it("without a bootstrap, loads the browser namespaces of the page's language only", async () => {
    document.documentElement.lang = "es";
    const i18n = await freshClient();
    expect(i18n.language).toBe("es");
    expect(i18n.t("login.submit", { ns: "admin" })).toBe("Iniciar sesión");
    expect(i18n.hasResourceBundle("en", "common")).toBe(false);
    expect(i18n.hasResourceBundle("es", "email")).toBe(false); // a server namespace has no loader at all
  });

  it("retries a chunk that fails once, instead of leaving the page dead", async () => {
    document.documentElement.lang = "es";
    const real = await import("./browser-loaders.generated");
    let calls = 0;
    vi.doMock("./browser-loaders.generated", () => ({
      BROWSER_LOADERS: {
        ...real.BROWSER_LOADERS,
        es: {
          ...real.BROWSER_LOADERS.es,
          common: () => {
            calls += 1;
            return calls === 1 ? Promise.reject(new Error("chunk failed")) : real.BROWSER_LOADERS.es.common();
          },
        },
      },
    }));
    const i18n = await freshClient();
    expect(calls).toBeGreaterThan(1);
    expect(i18n.t("nav.pricing", { ns: "common" })).toBe("Precios");
  });

  it("falls back to the default language when the page names none we ship", async () => {
    document.documentElement.lang = "de";
    expect((await freshClient()).language).toBe("en");
  });
});
