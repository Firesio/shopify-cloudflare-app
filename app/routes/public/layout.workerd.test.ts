import { RouterContextProvider, type LoaderFunctionArgs } from "react-router";
import { describe, expect, it } from "vitest";
import { loader } from "./layout";

const at = (path: string, headers: Record<string, string> = {}, params: Record<string, string> = {}): LoaderFunctionArgs => ({ request: new Request(`https://app.acme-apps.net${path}`, { headers }), url: new URL(`https://app.acme-apps.net${path}`), pattern: path, params, context: new RouterContextProvider() });

async function thrown(work: () => unknown): Promise<Response | { init?: { status?: number } }> {
  try {
    await work();
  } catch (error) {
    if (error instanceof Response) return error;
    if (typeof error === "object" && error !== null) return error;
    throw error;
  }
  throw new Error("expected a thrown response");
}

describe("the public layout reads the language from the address", () => {
  it("draws the default language at the plain address and Spanish under /es, with the header's words in each", async () => {
    const en = (await loader(at("/support"))).data;
    expect([en.language, en.prefix, en.labels.support]).toEqual(["en", "", "Support"]);
    const es = (await loader(at("/es/support", {}, { language: "es" }))).data;
    expect([es.language, es.prefix, es.labels.support, es.canonical]).toEqual(["es", "/es", "Soporte", "https://app.acme-apps.net/es/support"]);
    expect(es.alternates.map((alternate) => alternate.hreflang)).toEqual(["en", "es", "x-default"]);
  });

  it("opens the home address in the visitor's language, and never moves a deep page", async () => {
    const sent = await thrown(() => loader(at("/", { "accept-language": "es-ES,es;q=0.9" })));
    expect(sent instanceof Response && [sent.status, sent.headers.get("Location")]).toEqual([302, "/es"]);
    expect((await loader(at("/support", { "accept-language": "es" }))).data.language).toBe("en");
  });

  it("answers 404 for a folder that is no language of the app, and 301 from the default language's own folder", async () => {
    expect(await thrown(() => loader(at("/fr/support", {}, { language: "fr" })))).toMatchObject({ init: { status: 404 } });
    const moved = await thrown(() => loader(at("/en/support", {}, { language: "en" })));
    expect(moved instanceof Response && [moved.status, moved.headers.get("Location")]).toEqual([301, "/support"]);
  });
});
