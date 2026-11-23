import type { LoaderFunctionArgs } from "react-router";

const FILES = ["/sitemap-pages.xml", "/sitemap-content.xml"] as const;

/** `/sitemap.xml`: the index of the two sitemaps (the app's pages, the content); what robots and the search consoles are given. */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const origin = new URL(request.url).origin;
  const items = FILES.map((file) => `<sitemap><loc>${origin}${file}</loc></sitemap>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
};
