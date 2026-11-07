import { describe, expect, it } from "vitest";
import { MEMBER_PERMISSIONS } from "~/domain/member-access";
import { customPolicy } from "~/domain/member-permissions";
import type { MemberDetail } from "~/domain/member-team";
import { memberDetailFixture } from "~/test/member-detail";
import { renderRoute } from "~/test/render-route";
import MemberDetailPage from "./detail";

const member = memberDetailFixture;

const roles = ["owner", "admin", "member", "viewer"] as const;
const on = customPolicy({ enabled: true, alsoProtected: [] });
const render = (page: MemberDetail, locale: "en" | "es" = "en", policy = on) =>
  renderRoute({ path: "/app/members/mia", Component: MemberDetailPage, loaderData: { member: page, roles, policy }, locale, stage: "settled" });

/** What the page shows for each permission, read from the markup: an editable one is a checkbox, any other a static row. */
function checkboxes(html: string): { label: string; checked: boolean; details: string }[] {
  return [...html.matchAll(/<s-checkbox\b([^>]*)>/g)].map(([, attributes = ""]) => ({
    label: /label="([^"]*)"/.exec(attributes)?.[1] ?? "",
    checked: /\bchecked(=|\s|$)/.test(attributes),
    details: /details="([^"]*)"/.exec(attributes)?.[1] ?? "",
  }));
}
const editable = { allowed: true, grantable: ["app:view", "app:manage", "billing:manage"] as const };

describe("one member's page", () => {
  it("is headed by their name, with a link back to the team in the breadcrumb", async () => {
    const html = await render(member({ id: "mia" }));
    expect(html).toContain('heading="Mia"');
    expect(html).toMatch(/<s-link[^>]*slot="breadcrumb-actions"[^>]*href="\/app\/members"[^>]*>Team</);
  });

  it("shows their address and status, and marks who this is: you, the store owner, a collaborator", async () => {
    const html = await render(member({ id: "me", isYou: true, accountOwner: true, collaborator: true, can: { changeRole: false, remove: false, approve: false, restore: false } }));
    expect(html).toContain("mia@firesio.app");
    expect(html).toContain("Active");
    expect(html).toContain(">You<");
    expect(html).toContain("Store owner");
    expect(html).toContain("Collaborator");
    const plain = await render(member({ id: "mia" }));
    expect(plain).not.toContain("Collaborator");
    expect(plain).not.toContain(">You<");
  });

  it("says when they were added and last seen, and who invited them", async () => {
    const html = await render(member({ id: "mia", invitedBy: { name: "Olu", email: "olu@firesio.app" } }));
    expect(html).toContain("Oct 20, 2026");
    expect(html).toContain("Nov 1, 2026");
    expect(html).toContain("Invited by");
    expect(html).toContain("Olu");
    const never = await render(member({ id: "mia", lastSeenAt: null }));
    expect(never).toContain("Not yet");
    expect(never).not.toContain("Invited by");
  });

  it("names someone with no name by their address, an invitation as one, then as unnamed", async () => {
    expect(await render(member({ id: "a", name: null }))).toContain('heading="mia@firesio.app"');
    expect(await render(member({ id: "b", name: null, email: null, isInvitation: true, status: "invited" }))).toContain('heading="Invitation"');
    expect(await render(member({ id: "c", name: null, email: null }))).toContain('heading="Unnamed staff member"');
  });

  it("offers to remove them from the page's own actions, behind a confirmation that names them", async () => {
    const html = await render(member({ id: "mia" }));
    expect(html).toMatch(/<s-button[^>]*slot="secondary-actions"[^>]*tone="critical"[^>]*>Remove</);
    expect(html).toContain('id="remove-modal"');
    expect(html).toContain("Remove Mia?");
    expect(html).toContain("They lose access to");
  });

  it("offers an invitation to be cancelled rather than removed", async () => {
    const html = await render(member({ id: "inv", name: null, email: "i@firesio.app", status: "invited", isInvitation: true }));
    expect(html).toContain("Cancel invitation");
    expect(html).toContain("Invited");
  });

  it("offers to let a waiting person in as each role, and removing them, and no role to choose yet", async () => {
    const html = await render(member({ id: "w", status: "pending", can: { changeRole: true, remove: true, approve: true, restore: false } }));
    expect(html).toContain("Let in as Viewer");
    expect(html).toContain("Let in as Admin");
    expect(html).toContain("Waiting");
    expect(html).not.toContain("<s-select");
  });

  it("offers to restore a removed person as each role, and not to remove them again", async () => {
    const html = await render(member({ id: "r", status: "removed", can: { changeRole: false, remove: false, approve: false, restore: true } }));
    expect(html).toContain("Restore as Member");
    expect(html).toContain("Removed");
    expect(html).not.toContain('tone="critical"');
    expect(html).not.toContain("<s-select");
  });

  it("offers nothing on your own page, and says so", async () => {
    const html = await render(member({ id: "me", isYou: true, can: { changeRole: false, remove: false, approve: false, restore: false } }));
    expect(html).not.toContain("<s-select");
    expect(html).not.toContain('slot="secondary-actions"');
    expect(html).not.toContain('id="remove-modal"');
    expect(html).toContain("This is you.");
  });

  it("says you cannot change someone above you, and offers nothing", async () => {
    const html = await render(member({ id: "boss", role: "owner", can: { changeRole: false, remove: false, approve: false, restore: false } }));
    expect(html).not.toContain("<s-select");
    // The apostrophe is HTML-escaped in the markup.
    expect(html).toContain("You cannot change this person&#x27;s access.");
  });

  it("speaks Spanish with the same structure", async () => {
    const html = await render(member({ id: "mia", customize: editable }), "es");
    expect(html).toContain("Equipo");
    expect(html).toContain("Acceso");
    expect(html).toContain("Quitar");
  });
});

describe("the role of one member", () => {
  it("is a select of the roles the looker may give, with the member's own selected, and no button per role", async () => {
    const html = await render(member({ id: "mia" }));
    expect(html).toMatch(/<s-select[^>]*label="Role"[^>]*value="member"/);
    for (const role of roles) expect(html).toContain(`<s-option value="${role}"`);
    expect(html).toMatch(/<s-option[^>]*value="member"[^>]*selected/);
    expect(html).not.toContain("Make Admin");
    expect(html).not.toContain("Make Viewer");
  });

  it("describes the role that is selected", async () => {
    const html = await render(member({ id: "mia" }));
    expect(html).toContain("Uses the app and changes its settings and data.");
  });

  it("offers only the roles the looker may hand out", async () => {
    const html = await renderRoute({ path: "/app/members/mia", Component: MemberDetailPage, loaderData: { member: member({ id: "mia" }), roles: ["admin", "member", "viewer"], policy: on }, locale: "en", stage: "settled" });
    expect(html).not.toContain('<s-option value="owner"');
    expect(html).toContain('<s-option value="admin"');
  });

  it("says a member with permissions of their own has them, which role they started from, and offers their role's permissions back", async () => {
    const html = await render(member({ id: "mia", custom: true, role: "member", permissions: ["app:view"], customize: editable }));
    expect(html).toContain("Custom permissions");
    expect(html).toContain("Started from Member");
    expect(html).toContain("Use Member permissions");
  });

  it("does not talk of permissions of their own for a member on a role", async () => {
    const html = await render(member({ id: "mia", customize: editable }));
    expect(html).not.toContain("Custom permissions");
    expect(html).not.toContain("Use Member permissions");
  });
});

describe("saving the role and the permissions", () => {
  it("is one form around the page, with the admin's save bar inside it and nothing to send until something changes", async () => {
    const html = await render(member({ id: "mia", customize: editable }));
    expect(html).toMatch(/<form[^>]*method="post"[^>]*>\s*<s-page/);
    expect(html).toContain("data-form-save-bar");
    expect(html).not.toContain('name="intent"');
    expect(html).not.toContain("Save permissions");
  });

  it("has no form to save when there is nothing the looker may change", async () => {
    const html = await render(member({ id: "me", isYou: true, can: { changeRole: false, remove: false, approve: false, restore: false } }));
    expect(html).not.toContain("data-form-save-bar");
  });
});

describe("the permissions on one member's page", () => {
  const labels = ["Use the app", "Change settings and data", "Manage the plan", "Manage the team"];

  it("lists every permission the app has, in order, with what it allows", async () => {
    const html = await render(member({ id: "mia" }));
    for (const label of labels) expect(html).toContain(label);
    expect(html).toContain("Open the app and look at everything in it.");
    expect(html.indexOf("Use the app")).toBeLessThan(html.indexOf("Manage the team"));
  });

  it("shows what they hold as plain rows when the looker may not change it: no disabled checkbox that fades the text", async () => {
    const html = await render(member({ id: "mia", permissions: ["app:view", "app:manage"] }));
    expect(checkboxes(html)).toEqual([]);
    expect(html).not.toContain("disabled");
    for (const permission of MEMBER_PERMISSIONS) expect(html).toContain(`data-permission="${permission}"`);
    expect(html.match(/data-allowed="true"/g)).toHaveLength(2);
    expect(html.match(/data-allowed="false"/g)).toHaveLength(2);
  });

  it("says in words, for a screen reader, whether each permission is allowed", async () => {
    const html = await render(member({ id: "mia", permissions: ["app:view"] }));
    expect(html.match(/>Allowed</g)).toHaveLength(1);
    expect(html.match(/>Not allowed</g)).toHaveLength(3);
  });

  it("lets the looker tick what they may give, and shows the way in, what only comes with a role and what they may not give as plain rows with the reason", async () => {
    const html = await render(member({ id: "mia", permissions: ["app:view"], customize: { allowed: true, grantable: ["app:view", "app:manage"] } }));
    const boxes = checkboxes(html);
    expect(boxes.map((box) => box.label)).toEqual(["Change settings and data"]);
    expect(boxes[0]?.checked).toBe(false);
    expect(html).toContain('data-permission="app:view"');
    expect(html).toContain('data-permission="billing:manage"');
    expect(html).toContain('data-permission="members:manage"');
    expect(html).toContain("Only comes with the Owner or Admin role");
    expect(html).toContain("You do not have this permission yourself");
  });

  it("ticks the boxes for what the draft holds", async () => {
    const html = await render(member({ id: "mia", permissions: ["app:view", "app:manage", "billing:manage"], customize: editable }));
    expect(checkboxes(html).map((box) => [box.label, box.checked])).toEqual([["Change settings and data", true], ["Manage the plan", true]]);
  });

  it("says the app's protected permission only comes with a role, and the one it adds too", async () => {
    const strict = customPolicy({ enabled: true, alsoProtected: ["billing:manage"] });
    const html = await render(member({ id: "mia", customize: { allowed: true, grantable: ["app:view", "app:manage"] } }), "en", strict);
    expect(html.match(/Only comes with the Owner or Admin role/g)).toHaveLength(2);
  });

  it("offers no boxes when the app does not let merchants choose: the server says nobody may, and every permission is a plain row", async () => {
    const html = await render(member({ id: "mia", customize: { allowed: false, grantable: editable.grantable } }), "en", customPolicy({ enabled: false, alsoProtected: [] }));
    expect(checkboxes(html)).toEqual([]);
    expect(html.match(/data-permission=/g)).toHaveLength(MEMBER_PERMISSIONS.length);
    expect(html).not.toContain("Saving gives them permissions of their own");
  });

  it("says saving gives them permissions of their own, only where they can be edited", async () => {
    expect(await render(member({ id: "mia", customize: editable }))).toContain("Saving gives them permissions of their own");
    expect(await render(member({ id: "mia" }))).not.toContain("Saving gives them permissions of their own");
  });

  it("is in Spanish, with the names of the permissions", async () => {
    const html = await render(member({ id: "mia", customize: editable }), "es");
    expect(html).toContain("Permisos");
    for (const label of ["Usar la aplicación", "Cambiar ajustes y datos", "Gestionar el plan", "Gestionar el equipo"]) expect(html).toContain(label);
  });
});
