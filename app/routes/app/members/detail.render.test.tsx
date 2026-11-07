import { describe, expect, it } from "vitest";
import { MEMBER_PERMISSIONS } from "~/domain/member-access";
import { customPolicy } from "~/domain/member-permissions";
import type { MemberDetail } from "~/domain/member-team";
import { renderRoute } from "~/test/render-route";
import MemberDetailPage from "./detail";

const member = (overrides: Partial<MemberDetail> & Pick<MemberDetail, "id">): MemberDetail => ({
  name: "Mia",
  email: "mia@firesio.app",
  role: "member",
  status: "active",
  isYou: false,
  accountOwner: false,
  isInvitation: false,
  lastSeenAt: Date.UTC(2026, 10, 1, 9, 30),
  noSeat: false,
  collaborator: false,
  createdAt: Date.UTC(2026, 9, 20, 8, 0),
  invitedBy: null,
  custom: false,
  permissions: ["app:view", "app:manage"],
  customize: { allowed: false, grantable: ["app:view", "app:manage", "billing:manage"] },
  can: { changeRole: true, remove: true, approve: false, restore: false },
  ...overrides,
});

const roles = ["owner", "admin", "member", "viewer"] as const;
const on = customPolicy({ enabled: true, alsoProtected: [] });
const render = (page: MemberDetail, locale: "en" | "es" = "en", policy = on) =>
  renderRoute({ path: "/app/members/mia", Component: MemberDetailPage, loaderData: { member: page, roles, policy }, locale, stage: "settled" });

/** What each permission checkbox of the page says, read from the markup: its label, and whether it is ticked or locked. */
function checkboxes(html: string): { label: string; checked: boolean; disabled: boolean; details: string }[] {
  return [...html.matchAll(/<s-checkbox\b([^>]*)>/g)].map(([, attributes = ""]) => ({
    label: /label="([^"]*)"/.exec(attributes)?.[1] ?? "",
    checked: /\bchecked(=|\s|$)/.test(attributes),
    disabled: /\bdisabled(=|\s|$)/.test(attributes),
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

  it("shows their address, role with what it allows, and status", async () => {
    const html = await render(member({ id: "mia" }));
    expect(html).toContain("mia@firesio.app");
    expect(html).toContain("Member");
    expect(html).toContain("Uses the app and changes its settings and data.");
    expect(html).toContain("Active");
  });

  it("marks who this is: you, the store owner, a collaborator", async () => {
    const html = await render(member({ id: "me", isYou: true, accountOwner: true, collaborator: true, can: { changeRole: false, remove: false, approve: false, restore: false } }));
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

  it("offers every other role to an active member, and not the one they have", async () => {
    const html = await render(member({ id: "mia" }));
    expect(html).toContain("Make Admin");
    expect(html).toContain("Make Viewer");
    expect(html).not.toContain("Make Member");
    expect(html).not.toContain("Let in as");
    expect(html).not.toContain("Restore as");
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

  it("offers to let a waiting person in as each role, and removing them", async () => {
    const html = await render(member({ id: "w", status: "pending", can: { changeRole: true, remove: true, approve: true, restore: false } }));
    expect(html).toContain("Let in as Viewer");
    expect(html).toContain("Let in as Admin");
    expect(html).toContain("Waiting");
  });

  it("says a person who lost their seat has no seat", async () => {
    const html = await render(member({ id: "t", status: "pending", noSeat: true, can: { changeRole: true, remove: true, approve: true, restore: false } }));
    expect(html).toContain("No seat");
    expect(html).not.toContain(">Waiting<");
  });

  it("offers to restore a removed person as each role, and not to remove them again", async () => {
    const html = await render(member({ id: "r", status: "removed", can: { changeRole: false, remove: false, approve: false, restore: true } }));
    expect(html).toContain("Restore as Member");
    expect(html).toContain("Removed");
    expect(html).not.toContain('tone="critical"');
  });

  it("offers nothing on your own page, and says so", async () => {
    const html = await render(member({ id: "me", isYou: true, can: { changeRole: false, remove: false, approve: false, restore: false } }));
    expect(html).not.toContain("Make ");
    expect(html).not.toContain('slot="secondary-actions"');
    expect(html).not.toContain('id="remove-modal"');
    expect(html).toContain("This is you.");
  });

  it("says you cannot change someone above you, and offers nothing", async () => {
    const html = await render(member({ id: "boss", role: "owner", can: { changeRole: false, remove: false, approve: false, restore: false } }));
    expect(html).not.toContain("Make ");
    // The apostrophe is HTML-escaped in the markup.
    expect(html).toContain("You cannot change this person&#x27;s access.");
  });

  it("speaks Spanish with the same structure", async () => {
    const html = await render(member({ id: "mia" }), "es");
    expect(html).toContain("Equipo");
    expect(html).toContain("Acceso");
    expect(html).toContain("Quitar");
  });
});

describe("the permissions on one member's page", () => {
  const labels = ["Use the app", "Change settings and data", "Manage the plan", "Manage the team"];

  it("lists every permission the app has, in order, whatever the person holds", async () => {
    const boxes = checkboxes(await render(member({ id: "mia" })));
    expect(boxes.map((box) => box.label)).toEqual(labels);
    expect(boxes).toHaveLength(MEMBER_PERMISSIONS.length);
  });

  it("shows what they hold, read-only when the looker may not change it: every box locked, no save button", async () => {
    const html = await render(member({ id: "mia", permissions: ["app:view", "app:manage"] }));
    expect(checkboxes(html).map((box) => [box.checked, box.disabled])).toEqual([[true, true], [true, true], [false, true], [false, true]]);
    expect(html).not.toContain("Save permissions");
  });

  it("lets the looker tick what they may give, and locks the way in, what only comes with a role and what they may not give", async () => {
    const html = await render(member({ id: "mia", permissions: ["app:view"], customize: { allowed: true, grantable: ["app:view", "app:manage"] } }));
    const [view, manage, plan, team] = checkboxes(html);
    expect(view).toMatchObject({ checked: true, disabled: true });
    expect(manage).toMatchObject({ checked: false, disabled: false });
    expect(plan).toMatchObject({ checked: false, disabled: true });
    expect(team).toMatchObject({ checked: false, disabled: true });
    expect(team?.details).toContain("Only comes with the Owner or Admin role");
    expect(plan?.details).toContain("You do not have this permission yourself");
  });

  it("says the app's protected permission only comes with a role, and the one it adds too", async () => {
    const strict = customPolicy({ enabled: true, alsoProtected: ["billing:manage"] });
    const html = await render(member({ id: "mia", customize: { allowed: true, grantable: ["app:view", "app:manage"] } }), "en", strict);
    const boxes = checkboxes(html);
    expect(boxes[2]?.details).toContain("Only comes with the Owner or Admin role");
    expect(boxes[3]?.details).toContain("Only comes with the Owner or Admin role");
  });

  it("offers to save, with the save held back until something changes, and says saving gives them a set of their own", async () => {
    const html = await render(member({ id: "mia", customize: editable }));
    expect(html).toMatch(/<s-button[^>]*disabled[^>]*>Save permissions</);
    expect(html).toContain("Saving gives them permissions of their own");
  });

  it("offers no editor when the app does not let merchants choose, however the looker stands", async () => {
    const html = await render(member({ id: "mia" }), "en", customPolicy({ enabled: false, alsoProtected: [] }));
    expect(html).not.toContain("Save permissions");
    const boxes = checkboxes(html);
    expect(boxes).toHaveLength(MEMBER_PERMISSIONS.length);
    expect(boxes.every((box) => box.disabled)).toBe(true);
  });

  it("says a member with permissions of their own has them, and which role they started from", async () => {
    const html = await render(member({ id: "mia", custom: true, role: "member", permissions: ["app:view"], customize: editable }));
    expect(html).toContain("Custom permissions");
    expect(html).toContain("Started from Member");
    expect(html).not.toContain("Uses the app and changes its settings and data.");
  });

  it("offers every role to a member with permissions of their own, the one they started from too: choosing it applies the preset", async () => {
    const html = await render(member({ id: "mia", custom: true, role: "member", permissions: ["app:view"], customize: editable }));
    expect(html).toContain("Make Admin");
    expect(html).toContain("Make Member");
    expect(html).toContain("Make Viewer");
  });

  it("asks before replacing a member's own permissions with a role, and only for someone who has them", async () => {
    const custom = await render(member({ id: "mia", custom: true, role: "member", permissions: ["app:view"], customize: editable }));
    expect(custom).toContain('id="apply-role-modal"');
    expect(custom).toContain("They will hold exactly what");
    const preset = await render(member({ id: "mia" }));
    expect(preset).not.toContain('id="apply-role-modal"');
  });

  it("speaks Spanish with the same structure", async () => {
    const html = await render(member({ id: "mia", customize: editable }), "es");
    expect(html).toContain("Permisos");
    expect(checkboxes(html).map((box) => box.label)).toEqual(["Usar la aplicación", "Cambiar ajustes y datos", "Gestionar el plan", "Gestionar el equipo"]);
    expect(html).toContain("Guardar permisos");
  });
});
