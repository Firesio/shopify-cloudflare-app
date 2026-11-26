import { RouterContextProvider, type LoaderFunctionArgs } from "react-router";
import { describe, expect, it } from "vitest";
import { isShellLabels } from "@firesio/app/ui/shell";
import { firesio } from "~/firesio.server";
import { I18N } from "~/i18n";
import { loader as rootLoader } from "~/root";
import { loader as layoutLoader } from "./layout";

/** The loader's arguments for a GET of `path`; the layout's `context` is the router's own, with no middleware having run (the kept-out page's case: no member). */
function argsFor(path: string): LoaderFunctionArgs {
  const url = new URL(`https://example.test${path}`);
  return { request: new Request(url), url, params: {}, context: new RouterContextProvider(), pattern: path };
}

describe("shellLabels in the loader data (the error boundaries and the phone chrome speak the request's language)", () => {
  it("the root's loader returns them in the request's language", async () => {
    const es = await rootLoader(argsFor("/?locale=es"));
    expect(es.locale).toBe("es");
    expect(isShellLabels(es.shellLabels)).toBe(true);
    expect(es.shellLabels.locale).toBe("es");
    const en = await rootLoader(argsFor("/?locale=en"));
    expect(en.shellLabels.locale).toBe("en");
    expect(en.shellLabels.shell).not.toEqual(es.shellLabels.shell);
  });

  it("the /app layout's loader returns them in the request's language", async () => {
    // The admin middleware needs a Shopify session; the layout's own data stays as `maybeFrom` hands it for the kept-out page (no member), and the labels are built for real.
    const original = firesio.maybeFrom;
    const kept = { member: null, shop: "labels.myshopify.com", surface: "admin", services: { i18n: I18N, env: { SHOPIFY_API_KEY: "k" } } };
    Object.defineProperty(firesio, "maybeFrom", { value: () => kept, configurable: true, writable: true });
    const es = await layoutLoader(argsFor("/app?locale=es")).finally(() => Object.defineProperty(firesio, "maybeFrom", { value: original, configurable: true, writable: true }));
    expect(isShellLabels(es.shellLabels)).toBe(true);
    expect(es.shellLabels.locale).toBe("es");
    expect(es.shellLabels.shell).toEqual((await rootLoader(argsFor("/?locale=es"))).shellLabels.shell);
  });
});
