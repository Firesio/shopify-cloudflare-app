import { describe, expect, it } from "vitest";
import { err, ok } from "~/lib/result";
import { renderRoute } from "~/test/render-route";
import NewTicket from "./new";

const never = new Promise<never>(() => undefined);

const count = (html: string, pattern: string | RegExp) =>
  (html.match(typeof pattern === "string" ? new RegExp(`<${pattern}[\\s>]`, "g") : pattern) ?? []).length;

const SUBMISSION_KEY = "0a6c1f7e-6b1f-4d0b-8a57-1c9d3b8d9f42";

const form = (defaultEmail: Promise<unknown>, stage: "pending" | "settled", locale: "en" | "es" = "en") =>
  renderRoute({ path: "/app/support/new", Component: NewTicket, loaderData: { defaultEmail, submissionKey: SUBMISSION_KEY }, stage, locale });

describe("streaming the new-ticket form", () => {
  it("renders the whole form at once, with only the contact email held back", async () => {
    const html = await form(never, "pending");

    expect(html).toContain('<s-page heading="New ticket"');
    expect(html).toContain('name="subject"');
    expect(html).toContain('name="body"');
    // The pending twin carries no name, so it can never submit a blank address.
    expect(html).not.toContain('name="merchantEmail"');
  });

  it("holds the email field still at its real size: same label and help line, disabled, not a different placeholder control", async () => {
    const pending = await form(never, "pending");
    const loaded = await form(Promise.resolve(ok("owner@acme.shop")), "settled");
    const fieldOf = (html: string) => /<s-email-field[^>]*label="Email for replies"[^>]*>/.exec(html)?.[0] ?? "";

    expect(fieldOf(pending)).toContain("disabled");
    expect(fieldOf(pending)).toContain('details="We reply here as well as in the app.');
    expect(fieldOf(loaded)).not.toContain("disabled");
    expect(fieldOf(pending).match(/details="[^"]*"/)?.[0]).toBe(fieldOf(loaded).match(/details="[^"]*"/)?.[0]);
  });

  it("announces the wait for the email once, and not at all when it has arrived or failed", async () => {
    expect(count(await form(never, "pending"), /accessibilityRole="status"/g)).toBe(1);
    expect(count(await form(never, "pending"), /Loading your store&#x27;s contact email/g)).toBe(1);
    expect(await form(Promise.resolve(ok("owner@acme.shop")), "settled")).not.toContain('accessibilityRole="status"');
    expect(await form(Promise.resolve(err("failed")), "settled")).not.toContain('accessibilityRole="status"');
  });

  it("keeps the footprint of the loaded form: the same sections, fields, buttons and stacks", async () => {
    const pending = await form(never, "pending");
    const loaded = await form(Promise.resolve(ok("owner@acme.shop")), "settled");

    for (const tag of ["s-page", "s-section", "s-select", "s-text-field", "s-text-area", "s-email-field", "s-drop-zone", "s-button", "s-divider", "s-stack"]) {
      expect(count(pending, tag), tag).toBe(count(loaded, tag));
    }
  });

  it("prefills the contact email once Shopify answers", async () => {
    const html = await form(Promise.resolve(ok("owner@acme.shop")), "settled");
    expect(html).toContain('name="merchantEmail"');
    expect(html).toContain('value="owner@acme.shop"');
  });

  it("leaves an empty, editable email field when the lookup failed, rather than a wrong address", async () => {
    const html = await form(Promise.resolve(err("failed")), "settled");
    const field = /<s-email-field[^>]*name="merchantEmail"[^>]*>/.exec(html)?.[0];
    expect(field, "the email field must still render").toBeDefined();
    expect(field).not.toContain("value=");
  });

  it("posts the language the form is drawn in, so the ticket stores it even when the request has no ?locale", async () => {
    expect(await form(never, "pending", "es")).toMatch(/<input[^>]*name="language"[^>]*value="es"/);
    expect(await form(never, "pending", "en")).toMatch(/<input[^>]*name="language"[^>]*value="en"/);
  });

  it("translates the pending copy", async () => {
    const html = await form(never, "pending", "es");
    expect(html).toContain("Cargando el correo de contacto de tu tienda");
  });

  it("sends with an explicit primary action, not the save bar's Save", async () => {
    const html = await form(never, "pending");

    expect(html).not.toContain("data-save-bar");
    expect(html).not.toContain("data-discard-confirmation");
    expect(html).toMatch(/<s-button[^>]*slot="primary-action"[^>]*>Send ticket<\/s-button>/);
  });

  it("carries the key that makes sending the form twice one ticket", async () => {
    const html = await form(never, "pending");
    expect(html).toMatch(new RegExp(`<input[^>]*name="submissionKey"[^>]*value="${SUBMISSION_KEY}"`));
  });

  it("says how replies reach the merchant, without promising a response time nobody has set", async () => {
    const html = await form(never, "pending");
    expect(html).toContain("We reply by email and in this thread.");
    expect(html).not.toMatch(/within \d+|business day|hours/i);
  });

  it("offers the file picker with the limits spelled out from the server's constants", async () => {
    const html = await form(never, "pending");
    expect(html).toContain("<s-drop-zone");
    expect(html).toContain("Up to 10 files. Images up to 10 MB, video up to 100 MB, other files up to 25 MB.");
    expect(html).not.toContain("image/*");
  });

  it("translates the send action", async () => {
    expect(await form(never, "pending", "es")).toContain("Enviar ticket");
  });
});
