import { defineCollection, fields, standardBlocks } from "@firesio/app/cms";

/**
 * The app's own content (`@firesio/app/cms`, ticket 38 of `platform`): written from the portal's Content page or by an AI over the portal's MCP, kept in
 * this app's D1 and R2, served on this app's domain for search engines. The BLOG is the same on every app (this collection, these fields, these routes);
 * its look is the app's (`app/styles/public/_cms.scss`).
 *
 * A new kind of content (a changelog, landing pages, a help center) is one more `defineCollection` here and its routes: the portal draws its form from
 * the declaration, the MCP's `cms_*` tools write to it, nothing in the package or the portal changes.
 */
export const blogs = defineCollection({
  name: "blogs",
  label: "Blog",
  route: "/blogs/:slug",
  fields: {
    title: fields.text("Title", { required: true }),
    excerpt: fields.textarea("Summary", { max: 300 }),
    cover: fields.image("Cover"),
    date: fields.date("Date"),
    tags: fields.tags("Tags"),
    body: fields.blocks("Body", { of: ["text", "image", "cta", "quote", "faq"] }),
  },
  seo: { title: "title", description: "excerpt", image: "cover", date: "date" },
});

/** What `createFiresio({ cms })` is given. */
export const CMS = { collections: [blogs], blocks: standardBlocks };
