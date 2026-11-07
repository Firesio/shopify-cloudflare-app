import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createInstance } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { createMemoryRouter, RouterProvider, useActionData } from "react-router";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDetail } from "~/domain/member-team";
import { customPolicy } from "~/domain/member-permissions";
import { i18nOptions } from "~/i18n/options";
import type { MemberActionResult } from "~/members/feedback";
import { memberDetailFixture } from "~/test/member-detail";
import { MemberDetailView } from "./MemberDetailView";

/**
 * The part of one member's page that moves: the role select and the permission boxes are one draft, and the admin's save bar
 * follows it. The real page runs in a DOM with a fake action in place of the server (the intents are tested against D1
 * elsewhere); what is asserted is what the form WOULD SEND and when the bar is up. The bar itself and Polaris's controls are
 * host chrome: the host is faked at the `shopify` global and a control's value is set the way the real element does.
 */
const ROLES = ["owner", "admin", "member", "viewer"] as const;
const POLICY = customPolicy({ enabled: true, alsoProtected: [] });
const editable = { allowed: true, grantable: ["app:view", "app:manage", "billing:manage"] } as const;

const show = vi.fn<(id: string) => Promise<void>>();
const hide = vi.fn<(id: string) => Promise<void>>();

beforeAll(() => {
  Object.defineProperty(globalThis, "matchMedia", { value: () => ({ matches: false }), configurable: true });
  // A Polaris control is a custom element with a `value` (a select) and a `checked` (a checkbox) property. jsdom's unknown
  // elements have neither, so React would write attributes only; give them the properties, reflected to the attributes the
  // way a form control behaves, so the page sees what it sees in the admin.
  Object.defineProperty(HTMLElement.prototype, "value", {
    configurable: true,
    get() {
      return this.getAttribute("value") ?? "";
    },
    set(value: unknown) {
      this.setAttribute("value", String(value));
    },
  });
  Object.defineProperty(HTMLElement.prototype, "checked", {
    configurable: true,
    get() {
      return this.hasAttribute("checked");
    },
    set(value: unknown) {
      if (value === true) this.setAttribute("checked", "");
      else this.removeAttribute("checked");
    },
  });
});
afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "value");
  Reflect.deleteProperty(HTMLElement.prototype, "checked");
});
beforeEach(() => {
  show.mockReset().mockResolvedValue(undefined);
  hide.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(globalThis, "shopify", { value: { saveBar: { show, hide }, toast: { show: vi.fn() }, modal: { show: vi.fn(), hide: vi.fn() } }, configurable: true, writable: true });
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis, "shopify");
});

type Submission = Record<string, string | string[]>;

async function mount(member: MemberDetail, respond: (submission: Submission) => MemberActionResult = () => ({ success: "roleChanged" })) {
  const submissions: Submission[] = [];
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({ ...i18nOptions, lng: "en" });
  function Page() {
    const result = useActionData<MemberActionResult>();
    return <MemberDetailView member={member} roles={ROLES} policy={POLICY} result={result} />;
  }
  const router = createMemoryRouter(
    [
      {
        path: "/app/members/mia",
        Component: Page,
        action: async ({ request }) => {
          const form = await request.formData();
          const submission: Submission = {};
          for (const key of new Set(form.keys())) submission[key] = key === "permissions" ? form.getAll(key).map(String) : String(form.get(key));
          submissions.push(submission);
          return respond(submission);
        },
      },
    ],
    { initialEntries: ["/app/members/mia"] },
  );
  const view = render(
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
  await vi.waitFor(() => expect(view.container.querySelector("s-page")).not.toBeNull());
  const q = (selector: string) => view.container.querySelector(selector);
  const select = () => {
    const element = q("s-select");
    if (element === null) throw new Error("no role select");
    return element;
  };
  const checkbox = (label: string) => {
    const element = [...view.container.querySelectorAll("s-checkbox")].find((each) => each.getAttribute("label") === label);
    if (element === undefined) throw new Error(`no box ${label}`);
    return element;
  };
  const chooseRole = (role: string) => {
    const element = select();
    Reflect.set(element, "value", role);
    fireEvent(element, new Event("change", { bubbles: true }));
  };
  const tick = (label: string, on: boolean) => {
    const element = checkbox(label);
    Reflect.set(element, "checked", on);
    fireEvent(element, new Event("change", { bubbles: true }));
  };
  /** The fields the form would send now, as a name to values map. */
  const fields = (): Record<string, string[]> => {
    const sent: Record<string, string[]> = {};
    for (const input of view.container.querySelectorAll("input[type=hidden]")) {
      const name = input.getAttribute("name") ?? "";
      (sent[name] ??= []).push(input.getAttribute("value") ?? "");
    }
    return sent;
  };
  const press = (label: string) => {
    const button = [...view.container.querySelectorAll("ui-save-bar button, s-button")].find((each) => each.textContent === label);
    if (button === undefined) throw new Error(`no ${label}`);
    fireEvent.click(button);
  };
  return { view, submissions, q, select, checkbox, chooseRole, tick, fields, press };
}

const ticked = (page: Awaited<ReturnType<typeof mount>>) => [...page.view.container.querySelectorAll("s-checkbox")].filter((each) => each.hasAttribute("checked")).map((each) => each.getAttribute("label"));

describe("the role and the permissions of one member", () => {
  it("send nothing and show no bar until something changes", async () => {
    const page = await mount(memberDetailFixture({ id: "mia", customize: editable }));
    expect(page.fields()).toEqual({});
    expect(show).not.toHaveBeenCalled();
  });

  it("choosing a role asks for that role, fills the boxes with its preset, and raises the bar", async () => {
    const page = await mount(memberDetailFixture({ id: "mia", customize: editable }));
    page.chooseRole("viewer");
    expect(page.fields()).toEqual({ intent: ["changeRole"], id: ["mia"], role: ["viewer"] });
    expect(page.select().getAttribute("value")).toBe("viewer");
    expect(ticked(page)).toEqual([]);
    expect(show).toHaveBeenCalledWith("member-access-save-bar");
  });

  it("ticking a permission asks for a set based on the role, and raises the bar", async () => {
    const page = await mount(memberDetailFixture({ id: "mia", customize: editable }));
    page.tick("Manage the plan", true);
    expect(page.fields()).toEqual({ intent: ["setPermissions"], id: ["mia"], role: ["member"], permissions: ["app:view", "app:manage", "billing:manage"] });
    expect(ticked(page)).toEqual(["Change settings and data", "Manage the plan"]);
    expect(show).toHaveBeenCalled();
  });

  it("ticking it back puts everything as it was: nothing to send, and the bar goes down", async () => {
    const page = await mount(memberDetailFixture({ id: "mia", customize: editable }));
    page.tick("Manage the plan", true);
    page.tick("Manage the plan", false);
    expect(page.fields()).toEqual({});
    expect(hide).toHaveBeenCalledWith("member-access-save-bar");
  });

  it("choosing a role and then a permission keeps the new role as the one the set is based on", async () => {
    const page = await mount(memberDetailFixture({ id: "mia", customize: editable }));
    page.chooseRole("viewer");
    page.tick("Change settings and data", true);
    expect(page.fields()).toEqual({ intent: ["setPermissions"], id: ["mia"], role: ["viewer"], permissions: ["app:view", "app:manage"] });
  });

  it("lets go of what only comes with a role as soon as the boxes stop being the role's preset", async () => {
    const page = await mount(memberDetailFixture({ id: "mia", customize: editable }));
    page.chooseRole("admin");
    expect(page.fields().intent).toEqual(["changeRole"]);
    page.tick("Manage the plan", false);
    expect(page.fields().permissions).toEqual(["app:view", "app:manage"]);
    expect(page.fields().role).toEqual(["admin"]);
  });

  it("Discard puts the select and the boxes back to what is saved, and the bar goes down", async () => {
    const page = await mount(memberDetailFixture({ id: "mia", customize: editable }));
    page.chooseRole("viewer");
    page.tick("Manage the plan", true);
    act(() => page.press("Discard"));
    expect(page.fields()).toEqual({});
    expect(page.select().getAttribute("value")).toBe("member");
    expect(ticked(page)).toEqual(["Change settings and data"]);
    expect(hide).toHaveBeenCalledWith("member-access-save-bar");
  });

  it("Save sends the form: what the fields say, to the page's own action", async () => {
    const page = await mount(memberDetailFixture({ id: "mia", customize: editable }));
    page.chooseRole("viewer");
    await act(async () => page.press("Save"));
    await vi.waitFor(() => expect(page.submissions).toHaveLength(1));
    expect(page.submissions[0]).toEqual({ intent: "changeRole", id: "mia", role: "viewer" });
  });
});

describe("the permissions shown while the role is being chosen", () => {
  /** Which permissions the page shows as allowed, read from its rows. */
  const allowed = (page: Awaited<ReturnType<typeof mount>>) =>
    [...page.view.container.querySelectorAll("[data-permission]")].filter((row) => row.getAttribute("data-allowed") === "true").map((row) => row.getAttribute("data-permission"));

  it("follow the role chosen at once, when the app does not let merchants choose permissions one by one", async () => {
    const page = await mount(memberDetailFixture({ id: "mia" }));
    expect(allowed(page)).toEqual(["app:view", "app:manage"]);
    page.chooseRole("admin");
    expect(allowed(page)).toEqual(["app:view", "app:manage", "billing:manage", "members:manage"]);
    page.chooseRole("viewer");
    expect(allowed(page)).toEqual(["app:view"]);
  });

  it("go back to what is saved when the choice is discarded", async () => {
    const page = await mount(memberDetailFixture({ id: "mia" }));
    page.chooseRole("viewer");
    act(() => page.press("Discard"));
    expect(allowed(page)).toEqual(["app:view", "app:manage"]);
  });

  it("still save the role alone: there is nothing else to send", async () => {
    const page = await mount(memberDetailFixture({ id: "mia" }));
    page.chooseRole("admin");
    expect(page.fields()).toEqual({ intent: ["changeRole"], id: ["mia"], role: ["admin"] });
    expect(show).toHaveBeenCalledWith("member-access-save-bar");
  });

  it("follow the role chosen when merchants can tick permissions too: the plain rows (the way in, what only comes with a role) change as well", async () => {
    const page = await mount(memberDetailFixture({ id: "mia", customize: editable }));
    page.chooseRole("admin");
    expect(allowed(page)).toEqual(["app:view", "members:manage"]);
    page.chooseRole("viewer");
    expect(allowed(page)).toEqual(["app:view"]);
  });

  it("do not move for a member nobody here may change: the page has no role to choose", async () => {
    const page = await mount(memberDetailFixture({ id: "mia", can: { changeRole: false, remove: false, approve: false, restore: false } }));
    expect(page.q("s-select")).toBeNull();
    expect(allowed(page)).toEqual(["app:view", "app:manage"]);
  });
});

describe("a member who has permissions of their own", () => {
  const custom = () => memberDetailFixture({ id: "mia", custom: true, role: "member", permissions: ["app:view", "app:manage", "billing:manage"], customize: editable });

  it("starts as saved: their role in the select, their set in the boxes, nothing to send", async () => {
    const page = await mount(custom());
    expect(page.select().getAttribute("value")).toBe("member");
    expect(ticked(page)).toEqual(["Change settings and data", "Manage the plan"]);
    expect(page.fields()).toEqual({});
    expect(page.view.container.textContent).toContain("Custom permissions");
  });

  it("goes back to the role's own permissions on request, which asks for the role, and raises the bar", async () => {
    const page = await mount(custom());
    act(() => page.press("Use Member permissions"));
    expect(page.fields()).toEqual({ intent: ["changeRole"], id: ["mia"], role: ["member"] });
    expect(ticked(page)).toEqual(["Change settings and data"]);
    expect(show).toHaveBeenCalled();
    expect(page.view.container.textContent).not.toContain("Custom permissions");
  });
});

describe("a member the person looking may not edit", () => {
  it("has no select, no boxes and no save bar for a waiting person, who is let in as a role instead", async () => {
    const page = await mount(memberDetailFixture({ id: "mia", status: "pending", can: { changeRole: true, remove: true, approve: true, restore: false } }));
    expect(page.q("s-select")).toBeNull();
    expect(page.q("s-checkbox")).toBeNull();
    expect(page.q("[data-form-save-bar]")).toBeNull();
    act(() => page.press("Let in as Viewer"));
    await vi.waitFor(() => expect(page.submissions).toHaveLength(1));
    expect(page.submissions[0]).toEqual({ intent: "approve", role: "viewer", id: "mia" });
  });
});
