import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
  type RouteObject,
} from "react-router";
import Admins from "./index";
import type { SafeAdminUser } from "~/db/schema";

/**
 * Renders the admins page through the real SSR path. Proves the removal
 * confirmation is a REAL form wired to the action, rather than a native
 * `window.confirm` (which cannot be styled and does not exist during SSR).
 */
function admin(overrides: Partial<SafeAdminUser> = {}): SafeAdminUser {
  return {
    id: "other-id",
    email: "other@example.com",
    name: "Other Person",
    role: "admin",
    status: "active",
    notifySupport: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastLoginAt: null,
    ...overrides,
  };
}

const ACTOR = admin({ id: "actor-id", email: "me@example.com", name: "Me", role: "owner" });

async function render(admins: SafeAdminUser[]) {
  const routes: RouteObject[] = [
    {
      path: "/internal/admins",
      Component: Admins,
      loader: () => ({ actor: ACTOR, admins }),
    },
  ];

  const handler = createStaticHandler(routes);
  const context = await handler.query(
    new Request("https://example.test/internal/admins"),
  );
  if (context instanceof Response) {
    throw new Error(`Expected a render context, got ${context.status}`);
  }

  const html = renderToString(
    <StaticRouterProvider
      router={createStaticRouter(routes, context)}
      context={context}
    />,
  );

  expect(html.length, "rendered nothing — assertions would be vacuous").toBeGreaterThan(500);
  return html;
}

describe("the removal confirmation", () => {
  it("renders a real form the dialog submits, not a native confirm()", async () => {
    const html = await render([ACTOR, admin()]);

    // The hidden form the ConfirmDialog targets by id.
    expect(html).toContain('id="remove-admin"');
    // Its intent, so the action's dispatch reaches removeAdmin.
    expect(html).toContain('value="remove"');
  });

  it("offers no actions on your own row", async () => {
    // The guards would refuse them, so showing the buttons would be a lie.
    const html = await render([ACTOR]);
    expect(html).toContain("Me");
    expect(html).not.toContain("Actions for");
  });

  it("offers an actions menu on someone else's row", async () => {
    // The individual actions live inside the menu, which only renders once it is
    // opened, so index.dom.test.tsx opens it and checks every action.
    const html = await render([ACTOR, admin()]);
    expect(html).toContain('aria-label="Actions for Other Person"');
  });

  it("does not embed the reset field in the table", async () => {
    // The field lives on its own route so it exists without JavaScript; the
    // menu links to it (index.dom.test.tsx checks the href).
    const html = await render([ACTOR, admin()]);
    expect(html).not.toContain('name="newPassword"');
  });

  it("offers no reset on your own row — /internal/profile is that path", async () => {
    const html = await render([ACTOR]);
    expect(html).not.toContain("Reset password");
    expect(html).not.toContain("/reset");
  });

  it("shows 'Never' rather than a blank cell for an account that never signed in", async () => {
    const html = await render([ACTOR, admin({ lastLoginAt: null })]);
    expect(html).toContain("Never");
  });
});

describe("the admins table", () => {
  it("does not repeat the page title in the body — the shell header shows it", async () => {
    const html = await render([ACTOR]);
    expect(html).not.toContain("<h1");
  });

  it("puts the Add admin action in the table toolbar", async () => {
    const html = await render([ACTOR]);
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>.*?Add admin<\/button>/s);
  });

  it("labels the status and role of each account in its own row", async () => {
    const html = await render([ACTOR, admin({ status: "disabled", role: "admin" })]);
    const body = html.match(/<tbody[^>]*>(.*?)<\/tbody>/s)?.[1] ?? "";
    const rows = [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((match) =>
      match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    );
    const mine = rows.find((text) => text.includes("me@example.com")) ?? "";
    const theirs = rows.find((text) => text.includes("other@example.com")) ?? "";
    expect(mine).toMatch(/Me\s+You/);
    expect(mine).toContain("Owner");
    expect(theirs).toContain("Disabled");
    expect(theirs).not.toContain("You");
  });
});
