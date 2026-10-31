import { describe, expect, it } from "vitest";
import Support from "./support";
import { renderRoute } from "~/test/render-route";
import { identity } from "~/identity";

const loaderData = (over: { sent?: boolean; turnstileSiteKey?: string } = {}) => ({
  title: "Support",
  appName: "App",
  sent: false,
  turnstileSiteKey: "",
  ...over,
});

const render = (data: ReturnType<typeof loaderData>, locale: "en" | "es" = "en") =>
  renderRoute({ path: "/support", Component: Support, loaderData: data, locale, stage: "settled" });

describe("support contact identity", () => {
  it("renders the one support contact", async () => {
    const html = await render(loaderData());
    expect(html).toContain(identity.contacts.supportEmail);
  });
});

describe("support contact form", () => {
  it("labels every field and names the one that is optional", async () => {
    const html = await render(loaderData());
    for (const label of ["Your name", "Your email", "Subject", "How can we help?", "Store domain (optional)"]) {
      expect(html, label).toMatch(new RegExp(`<label[^>]*>${label.replace(/[()?]/g, "\\$&")}</label>`));
    }
    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toContain("Send message");
  });

  it("hides the decoy field from people and assistive technology", async () => {
    const html = await render(loaderData());
    expect(html).toMatch(/class="field field--trap" aria-hidden="true"/);
    const trap = html.match(/<input[^>]*id="contact-trap"[^>]*>/)?.[0] ?? "";
    expect(trap).toContain('name="website"');
    expect(trap).toContain('tabindex="-1"');
  });

  it("shows the bot check only when a site key is configured", async () => {
    expect(await render(loaderData())).not.toContain("cf-turnstile");
    expect(await render(loaderData({ turnstileSiteKey: "0x4AAAAAAA" }))).toMatch(/class="cf-turnstile" data-sitekey="0x4AAAAAAA"/);
  });

  it("confirms a sent message instead of showing the form again", async () => {
    const html = await render(loaderData({ sent: true }));
    expect(html).toContain("Your message is on its way");
    expect(html).not.toContain("<form");
  });

  it("is translated", async () => {
    const html = await render(loaderData(), "es");
    expect(html).toContain("Envíanos un mensaje");
    expect(html).toContain("Enviar mensaje");
    expect(html).not.toContain("Send message");
  });
});
