import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, data, RouterProvider } from "react-router";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import Admins from "./index";
import type { SafeAdminUser } from "~/db/schema";

/**
 * The row actions and the add dialog live in Radix portals that only render once
 * opened, so the server-render tests cannot see them. These drive the real page
 * in a DOM with a fake action standing in for the server (auth and the intents
 * are covered by their own tests) and assert what was SUBMITTED, which is the
 * contract the real action depends on.
 */
function admin(overrides: Partial<SafeAdminUser> = {}): SafeAdminUser {
  return {
    id: "other-id",
    email: "other@workmanjsc.vn",
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

const ACTOR = admin({ id: "actor-id", email: "me@workmanjsc.vn", name: "Me", role: "owner" });

type Submission = Record<string, string>;
type ActionResult = { error: "emailTaken" } | { success: "created"; name: string; role: string } | { success: "disabled"; name: string; role: string };

beforeAll(() => {
  // Radix Popper/Select measure with ResizeObserver, which jsdom does not provide.
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: ResizeObserverStub, configurable: true });
});

afterEach(cleanup);

function mount(admins: SafeAdminUser[], respond: (submission: Submission) => ActionResult) {
  const submissions: Submission[] = [];
  const router = createMemoryRouter(
    [
      {
        path: "/internal/admins",
        Component: Admins,
        loader: () => ({ actor: ACTOR, admins, resetSuccess: false }),
        action: async ({ request }) => {
          const submission: Submission = {};
          for (const [key, value] of await request.formData()) {
            if (typeof value === "string") submission[key] = value;
          }
          submissions.push(submission);
          const result = respond(submission);
          return "error" in result ? data(result, { status: 400 }) : data(result);
        },
      },
    ],
    { initialEntries: ["/internal/admins"] },
  );
  render(<RouterProvider router={router} />);
  return submissions;
}

function openRowMenu(name: string) {
  const trigger = screen.getByRole("button", { name: `Actions for ${name}` });
  fireEvent.keyDown(trigger, { key: "Enter" });
}

describe("the row actions menu", () => {
  it("lists every action for someone else's row, with a link to the reset page", async () => {
    mount([ACTOR, admin()], () => ({ success: "disabled", name: "Other Person", role: "admin" }));
    await screen.findByText("Other Person");
    openRowMenu("Other Person");

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Disable" })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Make owner" })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Remove" })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Reset password" }).getAttribute("href")).toBe(
      "/internal/admins/other-id/reset",
    );
  });

  it("offers Enable for a disabled account and Make admin for an owner", async () => {
    mount([ACTOR, admin({ status: "disabled", role: "owner" })], () => ({ success: "disabled", name: "x", role: "admin" }));
    await screen.findByText("Other Person");
    openRowMenu("Other Person");

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Enable" })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Make admin" })).toBeTruthy();
    expect(within(menu).queryByRole("menuitem", { name: "Disable" })).toBeNull();
    expect(within(menu).queryByRole("menuitem", { name: "Make owner" })).toBeNull();
  });

  it("submits the same intent and id the old buttons did", async () => {
    const submissions = mount([ACTOR, admin()], () => ({ success: "disabled", name: "Other Person", role: "admin" }));
    await screen.findByText("Other Person");
    openRowMenu("Other Person");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Disable" }));

    await waitFor(() => expect(submissions).toEqual([{ intent: "disable", id: "other-id" }]));
  });

  it("asks for confirmation before removing, then submits the remove intent", async () => {
    const submissions = mount([ACTOR, admin()], () => ({ success: "disabled", name: "Other Person", role: "admin" }));
    await screen.findByText("Other Person");
    openRowMenu("Other Person");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Remove Other Person?")).toBeTruthy();
    expect(submissions).toEqual([]);

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(submissions).toEqual([{ intent: "remove", id: "other-id" }]));
  });
});

describe("the add admin dialog", () => {
  function fillAndSubmit() {
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "New Person" } });
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "new@workmanjsc.vn" } });
    fireEvent.change(within(dialog).getByLabelText("Temporary password"), { target: { value: "correct horse" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add admin" }));
  }

  it("is closed until asked for, then submits the create intent with the field names the action reads", async () => {
    const submissions = mount([ACTOR], () => ({ success: "created", name: "New Person", role: "admin" }));
    await screen.findByText("Me");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Add admin" }));
    await screen.findByRole("dialog");
    fillAndSubmit();

    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0]).toMatchObject({
      intent: "create",
      name: "New Person",
      email: "new@workmanjsc.vn",
      password: "correct horse",
      role: "admin",
    });
  });

  it("closes once the action succeeds", async () => {
    mount([ACTOR], () => ({ success: "created", name: "New Person", role: "admin" }));
    await screen.findByText("Me");
    fireEvent.click(screen.getByRole("button", { name: "Add admin" }));
    await screen.findByRole("dialog");
    fillAndSubmit();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("stays open and shows the error inside the dialog when the action fails", async () => {
    mount([ACTOR], () => ({ error: "emailTaken" }));
    await screen.findByText("Me");
    fireEvent.click(screen.getByRole("button", { name: "Add admin" }));
    await screen.findByRole("dialog");
    fillAndSubmit();

    const dialog = await screen.findByRole("dialog");
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("An account with that email already exists.");
    // The message appears once: the page-level alert yields to the dialog's.
    expect(screen.getAllByText("An account with that email already exists.")).toHaveLength(1);
  });
});

describe("the admins table sorting", () => {
  /** Names in the first column, top to bottom (the header row is skipped). */
  function names(): string[] {
    const [, ...rows] = screen.getAllByRole("row");
    return rows.map((tableRow) => within(tableRow).getAllByRole("cell")[0]?.textContent ?? "");
  }

  it("sorts by name from the header button, ascending then descending", async () => {
    mount(
      [
        ACTOR,
        admin({ id: "z", name: "Zed", email: "zed@workmanjsc.vn" }),
        admin({ id: "b", name: "Bea", email: "bea@workmanjsc.vn" }),
      ],
      () => ({ success: "disabled", name: "x", role: "admin" }),
    );
    await screen.findByText("Zed");

    const sortByName = screen.getByRole("button", { name: "Name" });
    fireEvent.click(sortByName);
    expect(names()).toEqual(["Bea", "MeYou", "Zed"]);

    fireEvent.click(sortByName);
    expect(names()).toEqual(["Zed", "MeYou", "Bea"]);
  });

  it("sorts an account that never signed in as the oldest", async () => {
    mount(
      [
        ACTOR,
        admin({ id: "n", name: "Newbie", email: "never@workmanjsc.vn", lastLoginAt: null }),
        admin({ id: "r", name: "Recent", email: "recent@workmanjsc.vn", lastLoginAt: 1_800_000_000_000 }),
      ],
      () => ({ success: "disabled", name: "x", role: "admin" }),
    );
    await screen.findByText("Newbie");

    fireEvent.click(screen.getByRole("button", { name: "Last sign-in" }));
    // Ascending: the two accounts with no sign-in (0) come before the real date.
    expect(names().at(-1)).toBe("Recent");
  });
});
