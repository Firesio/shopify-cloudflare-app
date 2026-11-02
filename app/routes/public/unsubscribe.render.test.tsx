import { describe, expect, it } from "vitest";
import Unsubscribe from "./unsubscribe";
import { renderRoute } from "~/test/render-route";

type Data = { title: string; link: { kind: "valid"; masked: string } | { kind: "invalid" }; done: boolean };

const valid: Data = { title: "Unsubscribe", link: { kind: "valid", masked: "o***@firesio.app" }, done: false };

const render = (data: Data, locale: "en" | "es" = "en") =>
  renderRoute({ path: "/unsubscribe/:token", Component: Unsubscribe, loaderData: data, locale, stage: "settled" });

describe("the unsubscribe page", () => {
  it("asks first, naming the masked address, and unsubscribes only from a form post", async () => {
    const html = await render(valid);
    expect(html).toContain("o***@firesio.app");
    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Unsubscribe<\/button>/);
    expect(html).toContain("You will still get messages about your support conversations.");
  });

  it("confirms once it is done and offers nothing more to press", async () => {
    const html = await render({ ...valid, done: true });
    expect(html).toContain("o***@firesio.app will not receive announcements any more.");
    expect(html).not.toContain("<form");
  });

  it("says a link that is not ours is not valid, without showing any address or form", async () => {
    const html = await render({ title: "Unsubscribe", link: { kind: "invalid" }, done: false });
    expect(html).toContain("This unsubscribe link is not valid.");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("***");
  });

  it("is translated", async () => {
    const html = await render(valid, "es");
    expect(html).toContain("Cancelar la suscripción a los anuncios");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Cancelar la suscripción<\/button>/);
    expect(html).not.toContain("Unsubscribe");
  });
});
