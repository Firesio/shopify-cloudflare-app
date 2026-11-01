import { describe, expect, it } from "vitest";
import { MEMBER_ROLES, canAssignRole } from "./member-access";
import { MEMBER_STATUSES } from "./member-lifecycle";
import { contactsOf, orderTeam, rolesToOffer, seatSummary, teamRows, toTeamMember, type TeamMember } from "./member-team";

const member = (overrides: Partial<TeamMember> & Pick<TeamMember, "id">): TeamMember => ({
  linked: true,
  name: null,
  email: null,
  role: "member",
  status: "active",
  accountOwner: false,
  lastSeenAt: null,
  ...overrides,
});
const owner = { id: "me", role: "owner" };

describe("teamRows order", () => {
  it("puts waiting people first, then the team, then invitations, then the removed", () => {
    const rows = teamRows(owner, [
      member({ id: "r", status: "removed" }),
      member({ id: "i", status: "invited", linked: false }),
      member({ id: "a", status: "active" }),
      member({ id: "p", status: "pending" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["p", "a", "i", "r"]);
  });

  it("orders the team by role (owner first), then by name, case-insensitively", () => {
    const rows = teamRows(owner, [
      member({ id: "1", name: "zed", role: "member" }),
      member({ id: "2", name: "Amy", role: "member" }),
      member({ id: "3", name: "Bob", role: "owner" }),
      member({ id: "4", name: "carl", role: "viewer" }),
    ]);
    expect(rows.map((row) => row.name)).toEqual(["Bob", "Amy", "zed", "carl"]);
  });

  it("falls back to the email, then the id, to order someone with no name, and is stable for equal keys", () => {
    const rows = teamRows(owner, [member({ id: "b" }), member({ id: "a", email: "z@firesio.app" }), member({ id: "c", email: "a@firesio.app" })]);
    expect(rows.map((row) => row.id)).toEqual(["c", "b", "a"]);
  });

  it("does not change the list it was given", () => {
    const given = [member({ id: "b", status: "removed" }), member({ id: "a" })];
    teamRows(owner, given);
    expect(given.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("teamRows content", () => {
  it("marks the person looking, and an invitation nobody took up", () => {
    const rows = teamRows(owner, [member({ id: "me", name: "Me" }), member({ id: "inv", status: "invited", linked: false, email: "i@firesio.app" })]);
    expect(rows.find((row) => row.id === "me")).toMatchObject({ isYou: true, isInvitation: false });
    expect(rows.find((row) => row.id === "inv")).toMatchObject({ isYou: false, isInvitation: true, email: "i@firesio.app" });
  });

  it("carries only what the page shows: no Shopify user id", () => {
    const [row] = teamRows(owner, [toTeamMember({ ...member({ id: "x" }), shopifyUserId: "4242" })]);
    expect(JSON.stringify(row)).not.toContain("4242");
    expect(row).not.toHaveProperty("shopifyUserId");
  });
});

describe("what a row offers", () => {
  const status = (id: string, value: (typeof MEMBER_STATUSES)[number], role: (typeof MEMBER_ROLES)[number] = "member") =>
    teamRows(owner, [member({ id, status: value, role, linked: value !== "invited" })])[0]!.can;

  it("offers nothing on the person's own row: nobody changes or removes themselves", () => {
    expect(teamRows(owner, [member({ id: "me", role: "owner" })])[0]!.can).toEqual({ changeRole: false, remove: false, approve: false, restore: false });
  });

  it("offers each status exactly what applies to it", () => {
    expect(status("a", "active")).toEqual({ changeRole: true, remove: true, approve: false, restore: false });
    expect(status("p", "pending")).toEqual({ changeRole: true, remove: true, approve: true, restore: false });
    expect(status("i", "invited")).toEqual({ changeRole: true, remove: true, approve: false, restore: false });
    expect(status("r", "removed")).toEqual({ changeRole: false, remove: false, approve: false, restore: true });
  });

  it("offers an admin nothing on an owner, and everything on those below", () => {
    const admin = { id: "me", role: "admin" };
    expect(teamRows(admin, [member({ id: "o", role: "owner" })])[0]!.can).toEqual({ changeRole: false, remove: false, approve: false, restore: false });
    expect(teamRows(admin, [member({ id: "m", role: "member" })])[0]!.can).toMatchObject({ changeRole: true, remove: true });
  });

  it("offers a member and a viewer nothing at all, whoever the row is", () => {
    for (const role of ["member", "viewer"]) {
      for (const target of MEMBER_ROLES) {
        for (const state of MEMBER_STATUSES) {
          const row = teamRows({ id: "me", role }, [member({ id: "t", role: target, status: state })])[0]!;
          expect(Object.values(row.can)).toEqual([false, false, false, false]);
        }
      }
    }
  });

  it("agrees with the rule the server applies for who may be touched", () => {
    for (const actorRole of MEMBER_ROLES) {
      for (const target of MEMBER_ROLES) {
        const row = teamRows({ id: "me", role: actorRole }, [member({ id: "t", role: target })])[0]!;
        const mayManage = actorRole === "owner" || actorRole === "admin";
        expect(row.can.remove).toBe(mayManage && canAssignRole(actorRole, target));
      }
    }
  });
});

describe("rolesToOffer", () => {
  it("is every role an owner holds, and fewer for an admin", () => {
    expect(rolesToOffer("owner")).toEqual(MEMBER_ROLES);
    expect(rolesToOffer("admin")).toEqual(["admin", "member", "viewer"]);
    expect(rolesToOffer("viewer")).toEqual(["viewer"]);
    expect(rolesToOffer("retired")).toEqual([]);
  });
});

describe("seatSummary", () => {
  it("has no figures for an unlimited plan", () => {
    expect(seatSummary({ kind: "unlimited" }, 9)).toEqual({ kind: "unlimited" });
  });

  it("counts used and left against the limit", () => {
    expect(seatSummary({ kind: "limit", maximum: 5 }, 2)).toEqual({ kind: "limit", maximum: 5, used: 2, left: 3, over: 0 });
    expect(seatSummary({ kind: "limit", maximum: 5 }, 5)).toEqual({ kind: "limit", maximum: 5, used: 5, left: 0, over: 0 });
  });

  it("reports how far over the limit a downgraded team is, and never a negative number left", () => {
    expect(seatSummary({ kind: "limit", maximum: 2 }, 7)).toEqual({ kind: "limit", maximum: 2, used: 7, left: 0, over: 5 });
  });
});

describe("contactsOf", () => {
  it("lists owners before admins, then by name, with only a name and an address", () => {
    const contacts = contactsOf([
      { name: "Zed", email: "z@firesio.app", role: "admin" },
      { name: "Bea", email: "b@firesio.app", role: "owner" },
      { name: "Amy", email: null, role: "admin" },
    ]);
    expect(contacts).toEqual([
      { name: "Bea", email: "b@firesio.app" },
      { name: "Amy", email: null },
      { name: "Zed", email: "z@firesio.app" },
    ]);
  });

  it("leaves out someone with neither a name nor an address, and shows at most three", () => {
    const many = ["a", "b", "c", "d"].map((name) => ({ name, email: `${name}@firesio.app`, role: "owner" as const }));
    expect(contactsOf([{ name: null, email: null, role: "owner" }, ...many])).toHaveLength(3);
    expect(contactsOf([{ name: null, email: null, role: "owner" }])).toEqual([]);
    expect(contactsOf([])).toEqual([]);
  });
});

describe("orderTeam and toTeamMember", () => {
  it("orders without changing the list it is given, in the same order as the rows", () => {
    const given = [member({ id: "b", status: "removed" }), member({ id: "a", name: "Amy" }), member({ id: "p", status: "pending" })];
    const ordered = orderTeam(given);
    expect(ordered.map((entry) => entry.id)).toEqual(["p", "a", "b"]);
    expect(ordered.map((entry) => entry.id)).toEqual(teamRows(owner, given).map((row) => row.id));
    expect(given.map((entry) => entry.id)).toEqual(["b", "a", "p"]);
  });

  it("projects a member to what the views read and nothing more", () => {
    const { linked: _linked, ...rest } = member({ id: "x", name: "Ada" });
    const stored = { ...rest, shopifyUserId: "4242", secret: "not for the page" };
    const projected = toTeamMember(stored);
    expect(Object.keys(projected).sort()).toEqual(["accountOwner", "email", "id", "lastSeenAt", "linked", "name", "role", "status"]);
    expect(projected.linked).toBe(true);
    expect(JSON.stringify(projected)).not.toContain("not for the page");
    expect(JSON.stringify(projected)).not.toContain("4242");
    expect(toTeamMember({ ...stored, shopifyUserId: null }).linked).toBe(false);
  });
});
