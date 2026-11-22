import { fakeProvider, testNotify } from "@firesio/app/notify/testing";
import { i18nWords, reactEmailRenderer } from "@firesio/app/ui/email";
import { Text } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { appLinksFor, type AppServices } from "~/core/app-services";
import { identity } from "~/core/identity";
import { I18N } from "~/i18n";
import { kit } from "./kit";
import { layout } from "./layout";
import { welcome } from "./messages/welcome";
import { sendWelcome } from "./welcome";

const services: AppServices = { links: appLinksFor("https://app.acme-apps.net"), onboarding: { settingsSaved: async () => false, contactedSupport: async () => false } };
// Addresses are on real-looking domains on purpose: the kernel skips a reserved one (`.test`, `example.*`) as `reserved_address`, and mails nobody there.
const VARS = { shopName: "Acme", appUrl: "https://app.acme-apps.net/?shop=acme.myshopify.com" } as const;

/** A message on consent, only so a test can see what the layout does with `unsubscribeUrl` (the template sends none until the app declares a sender that accepts consent). */
const news = kit.defineMessage({
  id: "news",
  vars: z.object({}),
  basis: { consent: "news" },
  email: { subject: () => "News", body: () => <Text>Something new</Text> },
});

/** The real layout, the real welcome message and the real catalogue, rendered by React Email behind the real kernel, over a sender that records what it is given. */
function world() {
  const provider = fakeProvider();
  const notifications = kit.defineNotify({
    messages: [welcome, news],
    layout,
    senders: { app: { provider, from: "app@acme-apps.net" } },
    lists: { news: { owner: "platform", consent: { email: "opt-out" } } },
  });
  return { provider, mail: testNotify(notifications, { services, renderer: reactEmailRenderer(), words: i18nWords(I18N) }) };
}

describe("the welcome message in the app's layout", () => {
  it("sends a transactional mail in the shop's language, framed by the layout, with no unsubscribe link", async () => {
    const { provider, mail } = world();
    const outcome = await mail.notify.send(welcome, { shop: "acme.myshopify.com", to: { email: "owner@acme-store.net", locale: "en" }, vars: VARS, dedupeKey: "welcome:acme" });
    expect(outcome).toMatchObject({ email: { status: "queued" } });
    await mail.flush();
    const [request] = provider.requests;
    expect(request?.content).toMatchObject({ kind: "email", subject: `Welcome to ${identity.name}, Acme` });
    const html = request?.content.kind === "email" ? request.content.html : "";
    expect(html).toContain(`Welcome to ${identity.name}`);
    expect(html).toContain("https://app.acme-apps.net/?shop=acme.myshopify.com");
    expect(html).toContain(`Sent by ${identity.name}`);
    expect(html).not.toContain("Unsubscribe");
  });

  it("speaks Spanish to a shop whose language is Spanish", async () => {
    const { provider, mail } = world();
    await mail.notify.send(welcome, { shop: "acme.myshopify.com", to: { email: "owner@acme-store.net", locale: "es" }, vars: VARS, dedupeKey: "welcome:acme-es" });
    await mail.flush();
    expect(provider.requests[0]?.content).toMatchObject({ kind: "email", subject: `Te damos la bienvenida a ${identity.name}, Acme` });
  });

  it("is sent once per dedupe key: a second install event for the same shop mails nobody again", async () => {
    const { provider, mail } = world();
    const input = { shop: "acme.myshopify.com", to: { email: "owner@acme-store.net", locale: "en" }, vars: VARS, dedupeKey: "welcome:acme" } as const;
    await mail.notify.send(welcome, input);
    expect(await mail.notify.send(welcome, input)).toMatchObject({ email: { status: "duplicate" } });
    await mail.flush();
    expect(provider.requests).toHaveLength(1);
  });
});

describe("the layout and a mail on consent", () => {
  it("shows the one-click unsubscribe link the kernel hands it (a consent mail whose render lacks it is refused), and the mail carries the RFC 8058 headers", async () => {
    const { provider, mail } = world();
    await mail.notify.consents.grant({ list: "news", owner: "platform", channel: "email", address: "owner@acme-store.net", source: "test" });
    await mail.notify.send(news, { shop: null, to: { email: "owner@acme-store.net", locale: "en" }, vars: {} });
    await mail.flush();
    const request = provider.requests[0];
    expect(request?.content.kind === "email" ? request.content.html : "").toMatch(/https:\/\/app\.test\/unsubscribe\?t=/);
    expect(request?.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("sendWelcome, what `on.installed` does", () => {
  interface Row {
    readonly name: string | null;
    readonly email: string | null;
    readonly contactEmail: string | null;
    readonly primaryLocale: string | null;
  }
  const record: Row = { name: "Acme", email: "owner@acme-store.net", contactEmail: null, primaryLocale: null };
  const deps = (shop: Row | null) => {
    const { provider, mail } = world();
    return { provider, mail, deps: { shops: { get: async () => shop }, notify: mail.notify, links: services.links } };
  };

  it("mails the shop's address once, however many times the install job runs", async () => {
    const { provider, mail, deps: given } = deps(record);
    await sendWelcome(given, "acme.myshopify.com");
    await sendWelcome(given, "acme.myshopify.com");
    await mail.flush();
    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.to).toBe("owner@acme-store.net");
  });

  it("prefers the contact address the shop gave, and says nothing for a shop with no address or no row", async () => {
    const preferred = deps({ ...record, contactEmail: "hello@acme-store.net" });
    await sendWelcome(preferred.deps, "acme.myshopify.com");
    await preferred.mail.flush();
    expect(preferred.provider.requests[0]?.to).toBe("hello@acme-store.net");
    for (const shop of [null, { ...record, email: null }]) {
      const quiet = deps(shop);
      await sendWelcome(quiet.deps, "acme.myshopify.com");
      await quiet.mail.flush();
      expect(quiet.provider.requests).toEqual([]);
    }
  });
});

describe("the link in the welcome mail", () => {
  it("is the app's own entry with the shop, which the landing page sends on to /app", () => {
    expect(appLinksFor("https://app.acme-apps.net/").openAppUrl("a b.myshopify.com")).toBe("https://app.acme-apps.net/?shop=a%20b.myshopify.com");
  });
});
