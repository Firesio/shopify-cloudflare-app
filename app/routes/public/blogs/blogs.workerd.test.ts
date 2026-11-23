import { RouterContextProvider, type LoaderFunctionArgs } from "react-router";
import { describe, expect, it } from "vitest";
import { firesio } from "~/firesio.server";
import { setupTestDatabase } from "~/test/database";
import { loader as sitemapIndex } from "../sitemap";
import { loader as sitemapContent } from "../sitemap-content";
import { loader as sitemapPages } from "../sitemap-pages";
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
  it("reads the page's words in the language of the ADDRESS, never of the cookie or the browser", async () => {
    await published("first-post", "First post");
    const browser = { headers: { "accept-language": "es-ES,es;q=0.9", cookie: "firesio_lang=es" } };
    const english = await list(at("/blogs", browser));
    expect(english.list.items.map((item) => item.path)).toContain("/blogs/first-post");
    expect(english.labels.empty).toBe("No posts yet.");
    const spanish = await list(at("/es/blogs"));
    expect(spanish.list).toMatchObject({ locale: "es", path: "/es/blogs", items: [] });
    expect(spanish.labels.empty).toBe("Todavía no hay entradas.");
  });

  it("draws a post from its address, and answers 404 for one that does not exist", async () => {
    await published("second-post", "Second post");
    const page = await post(at("/blogs/second-post"));
    expect(page.page.title).toBe("Second post");
    await expect(post(at("/blogs/nobody-wrote-this"))).rejects.toMatchObject({ init: { status: 404 } });
  });

  it("lists the published posts in the content sitemap, the app's pages in every language in the pages sitemap, and both in the index", async () => {
    await published("third-post", "Third post");
    const content = await sitemapContent(at("/sitemap-content.xml"));
    expect(content.headers.get("content-type")).toContain("xml");
    expect(await content.text()).toContain("https://app.acme-apps.net/blogs/third-post");
    const pages = await (await sitemapPages(at("/sitemap-pages.xml"))).text();
    expect(pages).toContain("<loc>https://app.acme-apps.net/support</loc>");
    expect(pages).toContain('hreflang="es" href="https://app.acme-apps.net/es/support"');
    const index = await (await sitemapIndex(at("/sitemap.xml"))).text();
    expect(index).toContain("<loc>https://app.acme-apps.net/sitemap-pages.xml</loc>");
    expect(index).toContain("<loc>https://app.acme-apps.net/sitemap-content.xml</loc>");
  });
});
