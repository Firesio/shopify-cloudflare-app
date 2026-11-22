import { RouterContextProvider, type LoaderFunctionArgs } from "react-router";
import { describe, expect, it } from "vitest";
import { firesio } from "~/firesio.server";
import { setupTestDatabase } from "~/test/database";
import { loader as sitemap } from "../sitemap";
import { loader as list } from "./index";
import { loader as post } from "./post";

const at = (path: string, init?: RequestInit): LoaderFunctionArgs => ({ request: new Request(`https://app.acme-apps.net${path}`, init), url: new URL(`https://app.acme-apps.net${path}`), pattern: path, params: {}, context: new RouterContextProvider() });

async function published(slug: string, title: string) {
  const cms = firesio.services().cms;
  if (cms === null) throw new Error("the template declares cms");
  const created = await cms.create(`create-${slug}`, { collection: "blogs", slug, data: { title, excerpt: "A summary", body: [{ type: "text", data: { body: "Hello **world**" } }] }, actor: "test" });
  if (!created.ok) throw new Error(`${created.reason} ${JSON.stringify(created.issues ?? [])}`);
  const shown = await cms.publish(`publish-${slug}`, created.value.id, "test");
  if (!shown.ok) throw new Error(shown.reason);
}

setupTestDatabase();

describe("the blog on the app's own domain (`app/cms`, served by `firesio.cms`)", () => {
  it("lists a published post with the page's words in the reader's language", async () => {
    await published("first-post", "First post");
    const page = await list(at("/blogs", { headers: { "accept-language": "es-ES,es;q=0.9" } }));
    expect(page.list.items.map((item) => item.path)).toContain("/blogs/first-post");
    expect(page.labels.empty).toBe("Todavía no hay entradas.");
  });

  it("draws a post from its address, and answers 404 for one that does not exist", async () => {
    await published("second-post", "Second post");
    const page = await post(at("/blogs/second-post"));
    expect(page.page.title).toBe("Second post");
    await expect(post(at("/blogs/nobody-wrote-this"))).rejects.toMatchObject({ init: { status: 404 } });
  });

  it("lists the published posts in the sitemap", async () => {
    await published("third-post", "Third post");
    const answer = await sitemap(at("/sitemap.xml"));
    expect(answer.headers.get("content-type")).toContain("xml");
    expect(await answer.text()).toContain("https://app.acme-apps.net/blogs/third-post");
  });
});
