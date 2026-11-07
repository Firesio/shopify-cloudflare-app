import { describe, expect, it } from "vitest";
import type { TeamRow } from "~/domain/member-team";
import { renderRoute } from "~/test/render-route";
import Members from "./index";

const row = (overrides: Partial<TeamRow> & Pick<TeamRow, "id">): TeamRow => ({
  name: null,
  email: null,
  role: "member",
  status: "active",
  isYou: false,
  accountOwner: false,
  isInvitation: false,
  lastSeenAt: null,
  noSeat: false,
  custom: false,
  can: { changeRole: true, remove: true, approve: false, restore: false },
  ...overrides,
});

const base = {
  rows: [
    row({ id: "me", name: "Olu", email: "olu@firesio.app", role: "owner", isYou: true, accountOwner: true, can: { changeRole: false, remove: false, approve: false, restore: false } }),
    row({ id: "mia", name: "Mia", email: "mia@firesio.app", lastSeenAt: Date.UTC(2026, 10, 1, 9, 30) }),
  ],
  seats: { kind: "unlimited" as const },
  waiting: 0,
  roles: ["owner", "admin", "member", "viewer"] as const,
  autoJoinRole: "member" as const,
  canChangePlan: true,
  trimsOverage: false,
};

const render = (data: unknown, locale: "en" | "es" = "en") => renderRoute({ path: "/app/members", Component: Members, loaderData: data, locale, stage: "settled" });

describe("the team page", () => {
  it("lists each person with their name, address, role and status, and marks who you are", async () => {
    const html = await render(base);
    expect(html).toContain("Olu");
    expect(html).toContain("olu@firesio.app");
    expect(html).toContain("Mia");
    expect(html).toContain(">You<");
    expect(html).toContain("Store owner");
    expect(html).toContain("Owner");
    expect(html).toContain("Member");
    expect(html).toContain("Active");
  });

  it("links each person to their own page, and has no actions column or menu on the list", async () => {
    const html = await render(base);
    expect(html).toContain('href="/app/members/mia"');
    expect(html).toContain('href="/app/members/me"');
    expect(html).not.toContain("member-menu-");
    expect(html).not.toContain("<s-menu");
    expect(html).not.toContain(">Actions<");
    expect(html).not.toContain("Make Admin");
  });

  it("marks only a person who has permissions of their own, and does not list the permissions", async () => {
    const html = await render({ ...base, rows: [row({ id: "a", name: "Ada" }), row({ id: "b", name: "Bo", custom: true })] });
    expect(html.match(/>Custom</g)).toHaveLength(1);
    expect(html.indexOf(">Custom<")).toBeGreaterThan(html.indexOf("Bo"));
    expect(html).not.toContain("billing:manage");
  });

  it("shows an invitation as invited, a waiting person as waiting and a removed one as removed", async () => {
    const html = await render({
      ...base,
      waiting: 1,
      rows: [
        row({ id: "inv", email: "i@firesio.app", status: "invited", isInvitation: true }),
        row({ id: "w", name: "Wes", status: "pending" }),
        row({ id: "r", name: "Rex", status: "removed" }),
        row({ id: "n", name: "Nan", status: "pending", noSeat: true }),
      ],
    });
    expect(html).toContain("Invited");
    expect(html).toContain("Waiting");
    expect(html).toContain("Removed");
    expect(html).toContain("No seat");
  });

  it("names a person with no name by their address, then as unnamed", async () => {
    const html = await render({ ...base, rows: [row({ id: "a", email: "only@firesio.app" }), row({ id: "b" })] });
    expect(html).toContain("only@firesio.app");
    expect(html).toContain("Unnamed staff member");
  });

  it("says when someone was last seen, and when they have not been", async () => {
    const html = await render(base);
    expect(html).toContain("Nov 1, 2026");
    expect(html).toContain("Not yet");
  });

  it("warns that people are waiting, with how many, only when some are", async () => {
    expect(await render({ ...base, waiting: 2 })).toContain("People are waiting to be let in: 2");
    expect(await render(base)).not.toContain("waiting to be let in");
  });

  it("says nothing of seats for a plan that does not limit the team", async () => {
    expect(await render(base)).not.toContain("Seats in use");
  });

  it("shows seats used against the limit, and what is left", async () => {
    const html = await render({ ...base, seats: { kind: "limit", maximum: 5, used: 2, left: 3, over: 0 } });
    expect(html).toContain("Seats in use: 2 of 5");
    expect(html).toContain("Free: 3");
    expect(html).toContain('<s-progress value="2" max="5"');
    expect(html).not.toContain("Change plan");
  });

  it("tells a full team so, and offers the plan only to someone who may change it", async () => {
    const full = { ...base, seats: { kind: "limit", maximum: 2, used: 2, left: 0, over: 0 } };
    expect(await render(full)).toContain("Every seat is in use");
    expect(await render(full)).toContain("Change plan");
    expect(await render({ ...full, canChangePlan: false })).not.toContain("Change plan");
  });

  it("explains a team past its limit after a downgrade, and shows no negative number", async () => {
    const html = await render({ ...base, seats: { kind: "limit", maximum: 1, used: 3, left: 0, over: 2 } });
    expect(html).toContain("seat limit is 1 and 3 are in use");
    expect(html).toContain("Nobody is removed");
  });

  it("draws no progress bar for a plan with no seats at all", async () => {
    const html = await render({ ...base, seats: { kind: "limit", maximum: 0, used: 1, left: 0, over: 1 } });
    expect(html).not.toContain("<s-progress");
  });

  it("opens with the team itself: no introduction and no sentence about how strangers are handled", async () => {
    const html = await render(base);
    expect(html).not.toContain("who can use");
    expect(html).not.toContain("joins automatically");
    expect(html).not.toContain("Only people you invite");
    expect(html).not.toContain("waits here until you let them in");
  });

  it("makes the whole row open the person: the row delegates its click to the person's link", async () => {
    const html = await render(base);
    for (const id of ["mia", "me"]) {
      expect(html).toMatch(new RegExp(`<s-table-row[^>]*clickDelegate="member-link-${id}"`));
      expect(html).toMatch(new RegExp(`<s-link[^>]*id="member-link-${id}"[^>]*href="/app/members/${id}"|<s-link[^>]*href="/app/members/${id}"[^>]*id="member-link-${id}"`));
    }
  });

  it("has the invite form behind the primary action, offering only the roles on offer", async () => {
    const html = await render({ ...base, roles: ["admin", "member", "viewer"] });
    expect(html).toContain('slot="primary-action"');
    expect(html).toContain("Invite member");
    expect(html).toContain('commandFor="invite-modal"');
    expect(html).toContain("Send invitation");
    expect(html).not.toContain('value="owner"');
  });

  it("speaks Spanish with the same structure", async () => {
    const html = await render({ ...base, waiting: 1, rows: [row({ id: "a", name: "Ada", custom: true })] }, "es");
    expect(html).toContain(">Personalizado<");
    expect(html).toContain("Equipo");
    expect(html).toContain("Propietario");
    expect(html).toContain("Invitar a un miembro");
    expect(html).toContain("Personas esperando a que las dejes entrar: 1");
  });
});
