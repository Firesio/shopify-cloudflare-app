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
  renderRoute({ path: "/app/members/mia", Component: MemberDetailPage, loaderData: { member: page, roles, policy, canChangePlan: true }, locale, stage: "settled" });

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

  it("offers an invitation to be cancelled rather than removed, and the confirmation says the invitation is deleted", async () => {
    const html = await render(member({ id: "inv", name: null, email: "i@firesio.app", status: "invited", isInvitation: true }));
    expect(html).toContain("Invited");
    expect(html).toMatch(/<s-button[^>]*slot="secondary-actions"[^>]*>Cancel invitation</);
    expect(html).toContain("Cancel the invitation for i@firesio.app?");
    expect(html).toContain("The invitation is deleted");
    expect(html).not.toContain("They lose access to");
    expect(html).not.toContain("Remove i@firesio.app?");
  });

  it("lets a waiting person in with ONE role select and ONE button, and says why they cannot use the app", async () => {
    const html = await render(member({ id: "w", status: "pending", role: "viewer", can: { changeRole: true, remove: true, approve: true, restore: false } }));
    expect(html.match(/<s-select\b/g)).toHaveLength(1);
    expect(html.match(/Let in as /g)).toHaveLength(1);
    expect(html).toContain("Let in as Viewer");
    expect(html).toMatch(/<s-select[^>]*label="Role"[^>]*value="viewer"/);
    for (const role of roles) expect(html).toContain(`<s-option value="${role}"`);
    expect(html).toContain("is waiting to be let in");
    expect(html).toContain("Waiting");
    expect(html).not.toMatch(/<s-button[^>]*disabled/);
  });

  it("restores a removed person with one select and one button, and does not offer to remove them again", async () => {
    const html = await render(member({ id: "r", status: "removed", can: { changeRole: false, remove: false, approve: false, restore: true } }));
    expect(html.match(/<s-select\b/g)).toHaveLength(1);
    expect(html.match(/Restore as /g)).toHaveLength(1);
    expect(html).toContain("Restore as Member");
    expect(html).toContain("was removed and cannot use");
    expect(html).toContain("Removed");
    expect(html).not.toContain('tone="critical"');
  });

  it("disables letting in, with the reason beside it and a way to the plan, when no seat is free", async () => {
    const waiting = { id: "w", status: "pending", can: { changeRole: true, remove: true, approve: true, restore: false } } as const;
    const full = await render(member({ ...waiting, seat: { open: false, why: "full" } }));
    expect(full).toMatch(/<s-button[^>]*variant="primary"[^>]*disabled[^>]*>Let in as Member/);
    expect(full).toContain("Every seat is in use, so nobody can be let in right now.");
    expect(full).toContain('href="/app/billing"');
    const unreadable = await render(member({ ...waiting, seat: { open: false, why: "unreadable" } }));
    expect(unreadable).toMatch(/<s-button[^>]*disabled[^>]*>Let in as Member/);
    expect(unreadable).toContain("cannot read your plan");
    const open = await render(member({ ...waiting, seat: { open: true } }));
    expect(open).not.toMatch(/<s-button[^>]*disabled/);
    expect(open).not.toContain("Every seat is in use");
    const removed = await render(member({ id: "r", status: "removed", can: { changeRole: false, remove: false, approve: false, restore: true }, seat: { open: false, why: "full" } }));
    expect(removed).toMatch(/<s-button[^>]*disabled[^>]*>Restore as Member/);
  });

  it("offers the plan link only to someone who may change the plan", async () => {
    const page = member({ id: "w", status: "pending", can: { changeRole: true, remove: true, approve: true, restore: false }, seat: { open: false, why: "full" } });
    const html = await renderRoute({ path: "/app/members/w", Component: MemberDetailPage, loaderData: { member: page, roles, policy: on, canChangePlan: false }, locale: "en", stage: "settled" });
    expect(html).toContain("Every seat is in use");
    expect(html).not.toContain('href="/app/billing"');
  });

  it("explains a lost seat in its own words, not as waiting for approval", async () => {
    const html = await render(member({ id: "t", status: "pending", noSeat: true, can: { changeRole: true, remove: true, approve: true, restore: false } }));
    expect(html).toContain("No seat");
    expect(html).toContain("lost their seat when the plan&#x27;s seat limit was lowered");
    expect(html).not.toContain("is waiting to be let in");
  });

  it("shows no permissions for anyone who cannot use the app: waiting, no seat, removed or an invitation", async () => {
    const cases = [
      member({ id: "w", status: "pending", can: { changeRole: true, remove: true, approve: true, restore: false } }),
      member({ id: "t", status: "pending", noSeat: true, can: { changeRole: true, remove: true, approve: true, restore: false } }),
      member({ id: "r", status: "removed", can: { changeRole: false, remove: false, approve: false, restore: true } }),
      member({ id: "i", status: "invited", isInvitation: true, name: null, can: { changeRole: true, remove: true, approve: false, restore: false } }),
    ];
    for (const page of cases) {
      const html = await render(page);
      expect(html, page.id).not.toContain('heading="Permissions"');
      expect(html, page.id).not.toContain("data-permission=");
      expect(html, page.id).not.toContain("<s-checkbox");
    }
    expect(await render(member({ id: "a" }))).toContain('heading="Permissions"');
  });

  it("says what an invitation is, lets its role be set, and never offers to let it in", async () => {
    const html = await render(member({ id: "inv", status: "invited", isInvitation: true, name: null, email: "i@firesio.app", can: { changeRole: true, remove: true, approve: false, restore: false } }));
    expect(html).toContain("Nobody has opened");
    expect(html).toMatch(/<s-select[^>]*label="Role"/);
    expect(html).not.toMatch(/Let in as|Restore as/);
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

  it("marks what is allowed with a filled check circle and what is not with an empty circle, so the two read apart at a glance", async () => {
    const html = await render(member({ id: "mia", permissions: ["app:view", "app:manage"] }));
    expect(html.match(/<s-icon[^>]*type="check-circle-filled"/g)).toHaveLength(2);
    expect(html.match(/<s-icon[^>]*type="circle"/g)).toHaveLength(2);
    expect(html).not.toContain('type="check"');
    expect(html).not.toContain('type="minus"');
  });

  it("says in words, for a screen reader, whether each permission is allowed", async () => {
    const html = await render(member({ id: "mia", permissions: ["app:view"] }));
    expect(html.match(/>Allowed</g)).toHaveLength(1);
    expect(html.match(/>Not allowed</g)).toHaveLength(3);
  });

  it("keeps the spoken word beside the name, not inside it, so a screen reader never reads them run together", async () => {
    const html = await render(member({ id: "mia", permissions: ["app:view"] }));
    // The name and the word are sibling elements; the word is hidden from sight only.
    expect(html).toMatch(/<s-text>Use the app<\/s-text><s-text accessibilityVisibility="exclusive">Allowed<\/s-text>/);
    expect(html).not.toMatch(/Use the app<s-text accessibilityVisibility/);
  });

  it("groups the permissions under one name for a screen reader: whose they are", async () => {
    const html = await render(member({ id: "mia", customize: editable }));
    expect(html).toMatch(/<div role="group" aria-label="Permissions of Mia">/);
    const group = html.slice(html.indexOf('role="group"'), html.indexOf("</div>", html.indexOf('role="group"')));
    // Every permission, boxes and plain rows alike, sits inside the group.
    expect(checkboxes(group).map((box) => box.label)).toEqual(["Change settings and data", "Manage the plan"]);
    expect(group).toContain('data-permission="app:view"');
    expect(group).toContain('data-permission="members:manage"');
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
