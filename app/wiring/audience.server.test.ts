import { describe, expect, it } from "vitest";
import { buildEmail } from "~/emails/registry.server";
import { SUPPORTED_LOCALES } from "~/i18n/config";
import { shippedLayer } from "~/i18n/shipped-layer.server";
import { TEXT_UNITS } from "~/i18n/text-units";
import { shippedShopLanguages, type ContentLocalizer } from "~/lib/language/audience";
import { isUnitComplete, type TextLayer } from "~/lib/language/text";
import { SAMPLE_PAYLOADS } from "~/test/notification-payloads";
import { pseudoLayer } from "~/test/pseudo-locale";
import { createAudienceTextFor, defaultAudienceDeps, audienceTextFor } from "./audience.server";

const payload = { ...SAMPLE_PAYLOADS.support_staff_reply, locale: "es" };

describe("the shipped catalogues are complete for every text unit", () => {
  it("in every language", () => {
    const incomplete = SUPPORTED_LOCALES.flatMap((language) =>
      Object.keys(TEXT_UNITS)
        .filter((unit) => !isUnitComplete(TEXT_UNITS, unit, [shippedLayer(language)]))
        .map((unit) => `${language}/${unit}`),
    );
    expect(incomplete).toEqual([]);
  });
});

describe("audienceTextFor (default: shipped catalogues only)", () => {
  it("speaks the reader's language, with its direction", async () => {
    const text = await audienceTextFor({ unit: "email.layout", evidence: ["es-MX"] });
    expect(text.language).toBe("es");
    expect(text.direction).toBe("ltr");
    expect(text.fixedT("email")("senderDisclosure")).toBe("Este correo fue enviado por el soporte de TODO: Your App Name.");
  });
  it("uses the default language for unknown evidence, an unshipped language or nothing", async () => {
    for (const evidence of [[], ["de-DE"], [undefined, null, 42, "und"], ["zh-TW"]]) {
      expect((await audienceTextFor({ unit: "email.layout", evidence })).language, JSON.stringify(evidence)).toBe("en");
    }
  });
  it("returns the original for stored content", async () => {
    const text = await audienceTextFor({ unit: "email.layout", evidence: ["es"] });
    expect(await text.content([{ kind: "k", id: "1", field: "f", original: "Hola" }])).toEqual(["Hola"]);
  });
  it("falls back to the default language when the chosen language lacks part of the unit", async () => {
    const partial: TextLayer = { name: "partial", keys: () => ["senderDisclosure"], get: (ns, key) => (ns === "email" && key === "senderDisclosure" ? "Hola" : undefined) };
    const text = await createAudienceTextFor({
      ...defaultAudienceDeps(),
      layersFor: (language) => Promise.resolve(language === "es" ? [partial] : [shippedLayer(language)]),
    })({ unit: "email.layout", evidence: ["es"] });
    expect(text.language).toBe("en");
    expect(text.fixedT("email")("senderDisclosure")).toBe("This email was sent by TODO: Your App Name support.");
  });
});

/** The visible text nodes of an HTML email. */
function visibleText(html: string): string[] {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]*>/g, "\n")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll("&amp;", "&").replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .split("\n")
    .map((line) => line.replaceAll("\u034F", "").replace(/[\p{Z}\p{Cf}]+/gu, " ").trim())
    .filter((line) => line !== "");
}

describe("the pseudo-locale (en-XA): a translated email has no hard-coded visible text", () => {
  it("renders the support reply with every catalogue string pseudo-localised", async () => {
    const pseudoFor = createAudienceTextFor({
      ...defaultAudienceDeps(),
      shopLanguages: shippedShopLanguages([...SUPPORTED_LOCALES, "en-XA"]),
      layersFor: (language) => Promise.resolve([language === "en-XA" ? pseudoLayer(shippedLayer("en")) : shippedLayer(language)]),
    });
    const email = await buildEmail("support_staff_reply", { ...payload, locale: "en-XA" }, pseudoFor);
    expect(email.html).toContain('lang="en-XA"');

    // Text that comes from the payload (the merchant's and staff's own words, a URL) and the brand are not catalogue copy.
    const own = new Set([payload.subject, payload.excerpt, payload.threadUrl, "TODO: Your App Name"]);
    const offenders = visibleText(email.html).filter((line) => !own.has(line) && !(line.startsWith("[") && line.includes("]")));
    expect(offenders).toEqual([]);
    // ~30% longer: the disclosure is wider than its English source.
    const disclosure = visibleText(email.html).find((line) => line.includes("ṽ") || line.includes("ŕ"));
    expect(disclosure).toBeDefined();
    // The same email in English has every one of those strings unbracketed (so the test can fail).
    const plain = await buildEmail("support_staff_reply", { ...payload, locale: "en" }, audienceTextFor);
    expect(visibleText(plain.html).filter((line) => !own.has(line) && !(line.startsWith("[") && line.includes("]"))).length).toBeGreaterThan(3);
  });
});

describe("proof: an app adds an override layer and a content localizer in its own wiring, no email code changes", () => {
  it("changes the rendered email", async () => {
    const before = await buildEmail("support_staff_reply", payload, audienceTextFor);

    const overrides: TextLayer = {
      name: "overrides",
      keys: (namespace) => (namespace === "email" ? ["support.reply.cta"] : []),
      get: (namespace, key) => (namespace === "email" && key === "support.reply.cta" ? "Abrir el caso ahora" : undefined),
    };
    const localizer: ContentLocalizer = {
      localize: (refs) => Promise.resolve(refs.map((ref) => `${ref.original} (traducido)`)),
    };
    const customised = createAudienceTextFor({
      ...defaultAudienceDeps(),
      layersFor: (language) => Promise.resolve([...(language === "es" ? [overrides] : []), shippedLayer(language)]),
      localizer,
    });
    const after = await buildEmail("support_staff_reply", payload, customised);

    expect(before.html).not.toContain("Abrir el caso ahora");
    expect(after.html).toContain("Abrir el caso ahora");
    expect(after.html).toContain(`${payload.subject} (traducido)`);
    // The shared shipped catalogue was not touched by the override: the default wiring still renders the shipped text.
    const again = await buildEmail("support_staff_reply", payload, audienceTextFor);
    expect(again.html).toBe(before.html);
  });
});
