import { describe, expect, it } from "vitest";
import { buildEmail } from "~/emails/registry.server";
import { LANGUAGE_CODES } from "~/i18n/catalogues.generated";
import { shippedLayer } from "~/i18n/shipped-layer.server";
import { TEXT_UNITS } from "~/i18n/text-units";
import { shippedShopLanguages, type ContentLocalizer } from "~/lib/language/audience";
import { parseLanguageTag, type LanguageTag } from "~/lib/language/tag";
import { isUnitComplete, type TextLayer } from "~/lib/language/text";
import { SAMPLE_PAYLOADS } from "~/test/notification-payloads";
import { pseudoLayer } from "~/test/pseudo-locale";
import { audienceLanguage, merchantLanguage } from "~/i18n/roles";
import type { AudienceT } from "~/i18n/audience";
import { supportStaffReplyEmail } from "~/emails/templates/support-staff-reply";
import { createAudienceTextFor, createMerchantTextFor, defaultAudienceDeps, defaultMerchantDeps, audienceTextFor, audienceTextForRequest, textBuilders } from "./audience.server";

function evidence(...values: readonly string[]): readonly LanguageTag[] {
  return values.flatMap((value) => {
    const tag = parseLanguageTag(value);
    return tag === null ? [] : [tag];
  });
}
const es = parseLanguageTag("es");
const payload = { ...SAMPLE_PAYLOADS.support_staff_reply, ...(es === null ? {} : { language: es }) };

describe("the shipped catalogues are complete for every text unit", () => {
  it("in every language", () => {
    const incomplete = LANGUAGE_CODES.flatMap((language) =>
      Object.keys(TEXT_UNITS)
        .filter((unit) => !isUnitComplete(TEXT_UNITS, unit, [shippedLayer(language)], language))
        .map((unit) => `${language}/${unit}`),
    );
    expect(incomplete).toEqual([]);
  });
});

describe("audienceTextFor (default: shipped catalogues only)", () => {
  it("speaks the reader's language, with its direction", async () => {
    const text = await audienceTextFor({ unit: "email.layout", evidence: evidence("es-MX") });
    expect(text.language).toEqual({ role: "audience", code: "es" });
    expect(text.direction).toBe("ltr");
    expect(text.fixedT("email")("senderDisclosure")).toBe("Este correo fue enviado por el soporte de TODO: Your App Name.");
  });

  it("uses the default language for no evidence, an unshipped language or one it must not guess (zh-TW)", async () => {
    for (const values of [[], ["de-DE"], ["und"], ["zh-TW"], ["sr-Latn"]]) {
      expect((await audienceTextFor({ unit: "email.layout", evidence: evidence(...values) })).language.code, values.join()).toBe("en");
    }
  });

  it("uses a language it is told to (a fixed language), whatever else is known", async () => {
    const text = await audienceTextFor({ unit: "email.layout", fixed: audienceLanguage("es") });
    expect(text.language.code).toBe("es");
  });

  it("returns the original for one piece of stored content", async () => {
    const text = await audienceTextFor({ unit: "email.layout", evidence: evidence("es") });
    expect(await text.content({ kind: "k", id: "1", field: "f", original: "Hola" })).toBe("Hola");
  });

  it("does not let the translator render a key the unit does not list", async () => {
    const text = await audienceTextFor({ unit: "email.layout", evidence: evidence("en") });
    const t = text.fixedT("email");
    expect(t("senderDisclosure")).toContain("sent by");
    // B3: `support.reply.subject` is an `email` key that exists in the catalogue but is NOT in the layout unit, so it does
    // not compile (and at run time it would render the raw key, which is what the type exists to prevent).
    // @ts-expect-error a key outside the unit
    expect(t("support.reply.subject")).toBe("support.reply.subject");
    // @ts-expect-error a namespace the unit has no key of
    text.fixedT("admin");
  });

  it("lets a text built for a bigger unit be used where fewer keys are needed", async () => {
    const reply = await audienceTextFor({ unit: "email.support-reply", evidence: evidence("en") });
    const needsLayoutOnly = (text: Awaited<ReturnType<typeof audienceTextFor<"email.layout">>>): string => text.fixedT("email")("cta.copyLink");
    expect(needsLayoutOnly(reply)).toBe("Or copy this link:");
  });
});

describe("a language that lacks part of the unit is not used", () => {
  const partial: TextLayer = { name: "partial", get: (ns, key) => (ns === "email" && key === "senderDisclosure" ? "Hola" : undefined) };
  const layersFor = (language: string) => Promise.resolve(language === "es" ? [partial] : [shippedLayer("en")]);

  it("falls back to the default language when a key is missing", async () => {
    const text = await createAudienceTextFor({ ...defaultAudienceDeps(), layersFor })({ unit: "email.layout", evidence: evidence("es") });
    expect(text.language.code).toBe("en");
    expect(text.fixedT("email")("senderDisclosure")).toBe("This email was sent by TODO: Your App Name support.");
  });

  // B4: an empty string is not text.
  it("treats an empty string as missing, so the reader never gets the raw key", async () => {
    const blank: TextLayer = { name: "blank", get: (ns, key) => (ns === "email" ? (key === "senderDisclosure" ? "Hola" : "") : undefined) };
    const text = await createAudienceTextFor({ ...defaultAudienceDeps(), layersFor: (language) => Promise.resolve(language === "es" ? [blank] : [shippedLayer("en")]) })({
      unit: "email.layout",
      evidence: evidence("es"),
    });
    expect(text.language.code).toBe("en");
    expect(text.fixedT("email")("cta.copyLink")).toBe("Or copy this link:");
  });

  // B5: a plural key is a group with one string per category of the language.
  it("completes a plural group per language (the rendering of a count is proven in text.test.ts)", async () => {
    const units = { ...TEXT_UNITS, "email.layout": [{ namespace: "email", key: "items", plural: true }] } as const;
    const layer = (forms: Record<string, string>): TextLayer => ({ name: "plural", get: (ns, key) => (ns === "email" ? forms[key] : undefined) });
    const english = layer({ items_one: "{{count}} item", items_other: "{{count}} items" });
    const withoutMany = layer({ items_one: "{{count}} cosa", items_other: "{{count}} cosas" }); // Spanish needs `many` too
    const full = layer({ items_one: "{{count}} cosa", items_many: "{{count}} de cosas", items_other: "{{count}} cosas" });
    const build = (spanish: TextLayer) =>
      createAudienceTextFor({ ...defaultAudienceDeps(), units, layersFor: (language) => Promise.resolve([language === "es" ? spanish : english]) })({
        unit: "email.layout",
        evidence: evidence("es"),
      });
    expect(new Intl.PluralRules("es").resolvedOptions().pluralCategories).toContain("many");
    expect((await build(withoutMany)).language.code).toBe("en");
    const spanish = await build(full);
    expect(spanish.language.code).toBe("es");
  });
});

describe("audienceTextForRequest: the reader is whoever sent the request", () => {
  const request = (path: string, headers: Record<string, string> = {}) => new Request(`https://example.test${path}`, { headers });

  it("never takes the language from Shopify's ?locale (that is the admin user's language, not a visitor's)", async () => {
    const text = await audienceTextForRequest(request("/pricing?locale=es", { "Accept-Language": "en" }), "public.pricing");
    expect(text.language.code).toBe("en");
  });

  it("uses ?lng, then the weights of Accept-Language through the one script-aware negotiator", async () => {
    expect((await audienceTextForRequest(request("/pricing?lng=es"), "public.pricing")).language.code).toBe("es");
    expect((await audienceTextForRequest(request("/pricing", { "Accept-Language": "en;q=0.3, es;q=0.9" }), "public.pricing")).language.code).toBe("es");
    // B1: Traditional Chinese is never answered with a catalogue that is not Traditional Chinese.
    expect((await audienceTextForRequest(request("/pricing", { "Accept-Language": "zh-TW" }), "public.pricing")).language.code).toBe("en");
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
    .map((line) => line.replaceAll("͏", "").replace(/[\p{Z}\p{Cf}]+/gu, " ").trim())
    .filter((line) => line !== "");
}

describe("the pseudo-locale: a translated email has no hard-coded visible text", () => {
  it("renders the support reply with every catalogue string pseudo-localised", async () => {
    // The pseudo layer stands in for Spanish, so the language is a shipped one (the union is closed).
    const pseudoFor = createMerchantTextFor({
      ...defaultMerchantDeps(),
      layersFor: (language) => Promise.resolve([language === "es" ? pseudoLayer(shippedLayer("en")) : shippedLayer(language)]),
    });
    const email = await buildEmail("support_staff_reply", payload, { ...textBuilders, merchantTextFor: pseudoFor });
    expect(email.html).toContain('lang="es"');

    // Text that comes from the payload (the merchant's and staff's own words, a URL) and the brand are not catalogue copy.
    const own = new Set([payload.subject, payload.excerpt, payload.threadUrl, "TODO: Your App Name"]);
    const offenders = visibleText(email.html).filter((line) => !own.has(line) && !(line.startsWith("[") && line.includes("]")));
    expect(offenders).toEqual([]);
    // The same email in English has every one of those strings unbracketed (so the test can fail).
    const plain = await buildEmail("support_staff_reply", { ...payload, language: undefined }, textBuilders);
    expect(visibleText(plain.html).filter((line) => !own.has(line) && !(line.startsWith("[") && line.includes("]"))).length).toBeGreaterThan(3);
  });
});

describe("which language each event's email is written in", () => {
  it("writes the merchant's reply in the merchant's language, subject line and heading alike", async () => {
    const email = await buildEmail("support_staff_reply", payload, textBuilders);
    expect(email.html).toContain('lang="es"');
    expect(email.html).toContain("Este correo fue enviado por el soporte de");
  });

  it("falls back to the default language for a merchant language it does not ship", async () => {
    const de = parseLanguageTag("de");
    const email = await buildEmail("support_staff_reply", { ...payload, ...(de === null ? {} : { language: de }) }, textBuilders);
    expect(email.html).toContain('lang="en"');
  });

  it("writes every staff-facing email in the default language, whatever the payload says", async () => {
    for (const [event, sample] of [
      ["admin_password_reset", SAMPLE_PAYLOADS.admin_password_reset],
      ["support_merchant_activity", SAMPLE_PAYLOADS.support_merchant_activity],
      ["shop_installed", SAMPLE_PAYLOADS.shop_installed],
      ["shop_uninstalled", SAMPLE_PAYLOADS.shop_uninstalled],
      ["webhook_dead_letter", SAMPLE_PAYLOADS.webhook_dead_letter],
    ] as const) {
      const email = await buildEmail(event, { ...sample, ...(es === null ? {} : { language: es }) }, textBuilders);
      expect(email.html, event).toContain('lang="en"');
      expect(email.html, event).toContain("This email was sent by");
    }
  });
});

describe("the merchant is not a customer", () => {
  const overrides: TextLayer = { name: "customer overrides", get: (namespace, key) => (namespace === "email" && key === "support.reply.cta" ? "Abrir el caso ahora" : undefined) };
  const customerDeps = {
    ...defaultAudienceDeps(),
    layersFor: (language: string) => Promise.resolve([...(language === "es" ? [overrides] : []), shippedLayer(language === "es" ? "es" : "en")]),
  };

  it("a customer-facing override and the shop's customer languages change what a CUSTOMER reads", async () => {
    const customers = createAudienceTextFor({ ...customerDeps, localizer: { localize: (ref) => Promise.resolve(`${ref.original} (traducido)`) } });
    const text = await customers({ unit: "email.support-reply", evidence: evidence("es"), shop: "a.myshopify.com" });
    expect(text.fixedT("email")("support.reply.cta")).toBe("Abrir el caso ahora");
    expect(await text.content({ kind: "k", id: "1", field: "f", original: "x" })).toBe("x (traducido)");
  });

  it("but never the reply sent to the MERCHANT, which has its own builder over the shipped catalogue", async () => {
    const asMerchant = await textBuilders.merchantTextFor({ unit: "email.support-reply", language: merchantLanguage("es") });
    expect(asMerchant.fixedT("email")("support.reply.cta")).toBe("Leer y responder");
    expect(asMerchant.language).toEqual({ role: "merchant", code: "es" });
    const email = await buildEmail("support_staff_reply", payload, { ...textBuilders, audienceTextFor: createAudienceTextFor(customerDeps) }, "a.myshopify.com");
    expect(email.html).not.toContain("Abrir el caso ahora");
  });

  it("cannot be handed the other's language: the role is a parameter type", async () => {
    // @ts-expect-error a merchant language is not an audience language
    await textBuilders.audienceTextFor({ unit: "email.layout", fixed: merchantLanguage("es") });
    // @ts-expect-error an audience language is not a merchant language
    await textBuilders.merchantTextFor({ unit: "email.layout", language: audienceLanguage("es") });
  });

  it("passes the shop to a customer's text, and none to the merchant's", async () => {
    const seen: (string | undefined)[] = [];
    const watching = createAudienceTextFor({ ...defaultAudienceDeps(), shopLanguages: { forShop: (shop) => { seen.push(shop); return Promise.resolve({ primary: null, available: ["en"] }); } } });
    await buildEmail("shop_installed", SAMPLE_PAYLOADS.shop_installed, { ...textBuilders, audienceTextFor: watching }, "a.myshopify.com");
    expect(seen).toEqual(["a.myshopify.com"]);
  });
});

describe("plural keys take a count and plain keys do not", () => {
  it("is a type error to omit the count of a plural key, or to pass one to a plain key", () => {
    const t: AudienceT<"plain", "items"> = (key) => key;
    t("plain");
    t("items", 3);
    // @ts-expect-error a plural key needs its count
    t("items");
    // @ts-expect-error a plain key has no count
    t("plain", 3);
  });

  it("renders the form for the count it is given, through the real builder", async () => {
    const units = { ...TEXT_UNITS, "email.layout": [{ namespace: "email", key: "items", plural: true }] } as const;
    const layer: TextLayer = { name: "p", get: (ns, key) => (ns === "email" ? { items_one: "{{count}} item", items_other: "{{count}} items" }[key] : undefined) };
    const text = await createAudienceTextFor({ ...defaultAudienceDeps(), units, layersFor: () => Promise.resolve([layer]) })({ unit: "email.layout", evidence: evidence("en") });
    // The unit above is swapped at run time, so its keys are not in the static type: call through Reflect.
    const t = text.fixedT("email");
    expect(Reflect.apply(t, undefined, ["items", 1])).toBe("1 item");
    expect(Reflect.apply(t, undefined, ["items", 5])).toBe("5 items");
  });
});

describe("proof: an app adds an override layer and a content localizer in its own wiring, no email code changes", () => {
  it("changes a customer's text, and the localized subject reaches both the subject line and the heading", async () => {
    const localizer: ContentLocalizer<(typeof LANGUAGE_CODES)[number]> = { localize: (ref) => Promise.resolve(`${ref.original} (traducido)`) };
    const customers = createAudienceTextFor({ ...defaultAudienceDeps(), shopLanguages: shippedShopLanguages(LANGUAGE_CODES), localizer });
    const text = await customers({ unit: "email.support-reply", evidence: evidence("es") });
    const email = await supportStaffReplyEmail(payload, text);
    expect(email.subject).toBe(`Re: ${payload.subject} (traducido)`);
    expect(email.html).toContain(`${payload.subject} (traducido)`);
  });
});
