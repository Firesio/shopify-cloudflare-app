import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    Links: () => null,
    Meta: () => null,
    Outlet: () => <main>Home</main>,
    Scripts: () => null,
    ScrollRestoration: () => null,
    useLoaderData: () => ({ language: "en" }),
  };
});

import Root, { shouldRevalidate } from "./root";

function renderRootDocument() {
  const html = renderToStaticMarkup(<Root />);

  expect(html).toContain("<html");
  expect(html).toContain('name="viewport"');
  expect(html).toContain("<main>Home</main>");
  return html;
}

describe("root document assets", () => {
  it("does not load surface-specific stylesheets or preconnects", async () => {
    const html = renderRootDocument();

    expect(html).not.toContain("https://cdn.shopify.com/");
    expect(html).not.toContain(
      "https://cdn.shopify.com/static/fonts/inter/v4/styles.css",
    );
    expect(html).not.toContain("styles/public/public.scss");
    expect(html).not.toContain("internal.tailwind.css");
  });
});

describe("root language", () => {
  it("is chosen once per document: an in-app navigation (which can drop ?locale) never re-runs the root loader", () => {
    const args = { defaultShouldRevalidate: true, formMethod: undefined, currentUrl: new URL("https://x.test/app?locale=es"), nextUrl: new URL("https://x.test/app/support?x=1") };
    expect(Reflect.apply(shouldRevalidate, undefined, [args])).toBe(false);
    expect(Reflect.apply(shouldRevalidate, undefined, [{ ...args, formMethod: "post" }])).toBe(false);
  });
});
