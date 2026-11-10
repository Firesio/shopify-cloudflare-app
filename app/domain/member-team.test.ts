import { describe, expect, it } from "vitest";
import { MEMBER_PERMISSIONS, MEMBER_ROLES, canAssignRole, presetOf, type MemberPermission } from "./member-access";
import { customPolicy, grantableBy } from "./member-permissions";
import { MEMBER_STATUSES } from "./member-lifecycle";
import {
  activationSeat,
  contactsOf,
  hiddenCount,
  isCancelledInvitation,
  memberDetail,
  orderTeam,
  seatSummary,
  seatsOpenIn,
  teamNotices,
  teamRows,
  toTeamMember,
  type TeamMember,
} from "./member-team";

const member = (overrides: Partial<TeamMember> & Pick<TeamMember, "id">): TeamMember => ({
  linked: true,
  name: null,
  email: null,
  role: "member",
  status: "active",
  accountOwner: false,
  lastSeenAt: null,
  trimmed: false,
  custom: false,
  ...overrides,
});
const owner = { id: "me", role: "owner" };

describe("a person whose seat was taken by a trim", () => {
  it("is a row with no seat, let back in the way a waiting person is, and a waiting person is not", () => {
    const rows = teamRows(owner, [member({ id: "t", status: "pending", trimmed: true }), member({ id: "w", status: "pending" })]);
    expect(rows.find((row) => row.id === "t")).toMatchObject({ noSeat: true, status: "pending" });
    expect(rows.find((row) => row.id === "w")).toMatchObject({ noSeat: false });
  });

  it("is never marked on a row that is not pending", () => {
    const rows = teamRows(owner, MEMBER_STATUSES.filter((status) => status !== "pending").map((status) => member({ id: status, status, trimmed: true })));
    expect(rows.map((row) => row.noSeat)).toEqual([false, false, false]);
  });

  it("is read from the stored trim time", () => {
    const stored = { ...memberRecord({ id: "x" }), status: "pending" as const, shopifyUserId: "1" };
    expect(toTeamMember({ ...stored, trimmedAt: 5 }).trimmed).toBe(true);
    expect(toTeamMember(stored).trimmed).toBe(false);
  });
});

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

/** A stored member as the repository returns it: what `toTeamMember` is given. */
const memberRecord = (overrides: Partial<TeamMember> & Pick<TeamMember, "id">) => {
  const { linked: _linked, trimmed: _trimmed, custom: _custom, ...rest } = member(overrides);
  return { ...rest, trimmedAt: null, permissions: null };
};

const policyOn = customPolicy({ enabled: true, alsoProtected: [] });

/** What the person looking may do to one member: read from that member's own page, the only place actions are offered. */
const offers = (actor: { readonly id: string; readonly role: string; readonly permissions?: readonly MemberPermission[] | null }, target: TeamMember) =>
  memberDetail(actor, { ...memberRecord(target), shopifyUserId: target.linked ? "1" : null, collaborator: false, createdAt: 1 }, undefined, policyOn, undefined).can;

describe("a member with a set of their own, in the list", () => {
  const stored = { ...memberRecord({ id: "x" }), shopifyUserId: "1" };

  it("is read from the stored set: any set, an empty one included, is custom, and no set is not", () => {
    expect(toTeamMember({ ...stored, permissions: ["app:view"] }).custom).toBe(true);
    expect(toTeamMember({ ...stored, permissions: [] }).custom).toBe(true);
    expect(toTeamMember({ ...stored, permissions: null }).custom).toBe(false);
  });

  it("is marked on the row, without the permissions themselves: the list says only that it is custom", () => {
    const [row] = teamRows(owner, [toTeamMember({ ...stored, permissions: ["app:view", "billing:manage"] })]);
    expect(row).toMatchObject({ custom: true });
    expect(JSON.stringify(row)).not.toContain("billing:manage");
    expect(row).not.toHaveProperty("permissions");
  });

  it("is offered what any member is: the same rules, whatever their set holds", () => {
    expect(offers(owner, member({ id: "a", custom: true }))).toEqual(offers(owner, member({ id: "a" })));
  });

  it("judges the person looking by their own set: an admin with a set that lacks members:manage offers nothing", () => {
    const limited = { id: "me", role: "admin", permissions: ["app:view", "app:manage"] satisfies MemberPermission[] };
    expect(offers(limited, member({ id: "a" }))).toEqual({ changeRole: false, remove: false, approve: false, restore: false });
  });
});

describe("teamRows content", () => {
  it("marks the person looking, and an invitation nobody took up", () => {
    const rows = teamRows(owner, [member({ id: "me", name: "Me" }), member({ id: "inv", status: "invited", linked: false, email: "i@firesio.app" })]);
    expect(rows.find((row) => row.id === "me")).toMatchObject({ isYou: true, isInvitation: false });
    expect(rows.find((row) => row.id === "inv")).toMatchObject({ isYou: false, isInvitation: true, email: "i@firesio.app" });
  });

  it("carries nothing to do to the person: a list has no actions, so a row has none to offer", () => {
    const [row] = teamRows(owner, [member({ id: "a" })]);
    expect(row).not.toHaveProperty("can");
  });

  it("carries only what the page shows: no Shopify user id", () => {
    const [row] = teamRows(owner, [toTeamMember({ ...memberRecord({ id: "x" }), shopifyUserId: "4242" })]);
    expect(JSON.stringify(row)).not.toContain("4242");
    expect(row).not.toHaveProperty("shopifyUserId");
  });
});

describe("what a member's page offers", () => {
  const status = (id: string, value: (typeof MEMBER_STATUSES)[number], role: (typeof MEMBER_ROLES)[number] = "member") =>
    offers(owner, member({ id, status: value, role, linked: value !== "invited" }));

  it("offers nothing on the person's own row: nobody changes or removes themselves", () => {
    expect(offers(owner, member({ id: "me", role: "owner" }))).toEqual({ changeRole: false, remove: false, approve: false, restore: false });
  });

  it("offers each status exactly what applies to it", () => {
    expect(status("a", "active")).toEqual({ changeRole: true, remove: true, approve: false, restore: false });
    expect(status("p", "pending")).toEqual({ changeRole: true, remove: true, approve: true, restore: false });
    expect(status("i", "invited")).toEqual({ changeRole: true, remove: true, approve: false, restore: false });
    expect(status("r", "removed")).toEqual({ changeRole: false, remove: false, approve: false, restore: true });
  });

  it("offers an admin nothing on an owner, and everything on those below", () => {
    const admin = { id: "me", role: "admin" };
    expect(offers(admin, member({ id: "o", role: "owner" }))).toEqual({ changeRole: false, remove: false, approve: false, restore: false });
    expect(offers(admin, member({ id: "m", role: "member" }))).toMatchObject({ changeRole: true, remove: true });
  });

  it("offers an admin everything on another admin and nothing on a removed or pending owner, which only an owner may restore or approve", () => {
    const admin = { id: "me", role: "admin" };
    expect(offers(admin, member({ id: "a", role: "admin" }))).toMatchObject({ changeRole: true, remove: true });
    expect(offers(admin, member({ id: "o", role: "owner", status: "removed" }))).toEqual({ changeRole: false, remove: false, approve: false, restore: false });
    expect(offers(admin, member({ id: "o", role: "owner", status: "pending" }))).toEqual({ changeRole: false, remove: false, approve: false, restore: false });
    expect(offers({ id: "me", role: "owner" }, member({ id: "o", role: "owner", status: "removed" })).restore).toBe(true);
  });

  it("offers a member and a viewer nothing at all, whoever the row is", () => {
    for (const role of ["member", "viewer"]) {
      for (const target of MEMBER_ROLES) {
        for (const state of MEMBER_STATUSES) {
          expect(Object.values(offers({ id: "me", role }, member({ id: "t", role: target, status: state })))).toEqual([false, false, false, false]);
        }
      }
    }
  });

  it("agrees with the rule the server applies for who may be touched", () => {
    for (const actorRole of MEMBER_ROLES) {
      for (const target of MEMBER_ROLES) {
        const mayManage = actorRole === "owner" || actorRole === "admin";
        expect(offers({ id: "me", role: actorRole }, member({ id: "t", role: target })).remove).toBe(mayManage && canAssignRole({ role: actorRole }, target));
      }
    }
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

  it("shows the admins when the shop has no owner at all", () => {
    expect(
      contactsOf([
        { name: "Zed", email: "z@firesio.app", role: "admin" },
        { name: "Amy", email: "a@firesio.app", role: "admin" },
      ]),
    ).toEqual([
      { name: "Amy", email: "a@firesio.app" },
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
    const stored = { ...memberRecord({ id: "x", name: "Ada" }), shopifyUserId: "4242", secret: "not for the page" };
    const projected = toTeamMember(stored);
    expect(Object.keys(projected).sort()).toEqual(["accountOwner", "custom", "email", "id", "lastSeenAt", "linked", "name", "role", "status", "trimmed"]);
    expect(projected.linked).toBe(true);
    expect(JSON.stringify(projected)).not.toContain("not for the page");
    expect(JSON.stringify(projected)).not.toContain("4242");
    expect(toTeamMember({ ...stored, shopifyUserId: null }).linked).toBe(false);
  });
});

describe("memberDetail", () => {
  const on = customPolicy({ enabled: true, alsoProtected: [] });
  const off = customPolicy({ enabled: false, alsoProtected: [] });
  const stored = (overrides: Partial<Parameters<typeof memberDetail>[1]> = {}) => ({
    ...memberRecord({ id: "x", name: "Ada", email: "ada@firesio.app" }),
    shopifyUserId: "4242",
    trimmedAt: null,
    collaborator: false,
    createdAt: 1_000,
    invitedBy: "boss-id",
    ...overrides,
  });


  it("carries what the row shows and what only a detail page shows, and who invited them by name and address", () => {
    const detail = memberDetail(owner, stored({ collaborator: true }), { name: "Bo", email: "bo@firesio.app" }, on, undefined);
    expect(detail).toMatchObject({ id: "x", name: "Ada", email: "ada@firesio.app", role: "member", status: "active", collaborator: true, createdAt: 1_000, invitedBy: { name: "Bo", email: "bo@firesio.app" } });
  });

  it("has nobody who invited them when there is no such member, and never carries the Shopify user id or the inviter's id", () => {
    const detail = memberDetail(owner, stored(), undefined, on, undefined);
    expect(detail.invitedBy).toBeNull();
    expect(JSON.stringify(detail)).not.toContain("4242");
    expect(JSON.stringify(detail)).not.toContain("boss-id");
  });

  it("marks the person looking, an invitation nobody took up, and a lost seat", () => {
    expect(memberDetail({ id: "x", role: "owner" }, stored(), undefined, on, undefined).isYou).toBe(true);
    expect(memberDetail(owner, stored({ status: "invited", shopifyUserId: null }), undefined, on, undefined).isInvitation).toBe(true);
    expect(memberDetail(owner, stored({ status: "pending", trimmedAt: 7 }), undefined, on, undefined).noSeat).toBe(true);
  });

  describe("what they hold", () => {
    it("is their role's preset while they have no set", () => {
      const detail = memberDetail(owner, stored({ role: "member", permissions: null }), undefined, on, undefined);
      expect(detail).toMatchObject({ custom: false, permissions: presetOf("member") });
    });

    it("is exactly their set when they have one, whatever their role was", () => {
      const detail = memberDetail(owner, stored({ role: "admin", permissions: ["app:view", "app:manage"] }), undefined, on, undefined);
      expect(detail).toMatchObject({ custom: true, role: "admin", permissions: ["app:view", "app:manage"] });
    });

    it("is nothing for an empty set: an empty set is a set", () => {
      expect(memberDetail(owner, stored({ permissions: [] }), undefined, on, undefined)).toMatchObject({ custom: true, permissions: [] });
    });
  });

  describe("whether they can be given a set, and what the person looking may tick", () => {
    it("allows it for an active member of an app that lets merchants do it, and offers what the giver holds without what is protected", () => {
      const detail = memberDetail(owner, stored(), undefined, on, undefined);
      expect(detail.customize).toEqual({ allowed: true, grantable: grantableBy(owner, on) });
      expect(detail.customize.grantable).not.toContain("members:manage");
    });

    it("offers less when the app protects more, and never the permission that manages the team", () => {
      const strict = customPolicy({ enabled: true, alsoProtected: ["billing:manage"] });
      expect(memberDetail(owner, stored(), undefined, strict, undefined).customize.grantable).toEqual(["app:view", "app:manage"]);
    });

    it("is never allowed when the app does not let merchants do it", () => {
      expect(memberDetail(owner, stored(), undefined, off, undefined).customize.allowed).toBe(false);
    });

    it("is never allowed on your own page, on an owner, on the store's owner, or on anyone who is not active", () => {
      expect(memberDetail({ id: "x", role: "owner" }, stored(), undefined, on, undefined).customize.allowed).toBe(false);
      expect(memberDetail(owner, stored({ role: "owner" }), undefined, on, undefined).customize.allowed).toBe(false);
      expect(memberDetail(owner, stored({ accountOwner: true }), undefined, on, undefined).customize.allowed).toBe(false);
      for (const status of MEMBER_STATUSES.filter((status) => status !== "active")) {
        expect(memberDetail(owner, stored({ status, shopifyUserId: status === "invited" ? null : "4242" }), undefined, on, undefined).customize.allowed, status).toBe(false);
      }
    });

    it("is never allowed to someone who cannot manage the team, nor on someone they may not touch", () => {
      expect(memberDetail({ id: "me", role: "member" }, stored(), undefined, on, undefined).customize.allowed).toBe(false);
      expect(memberDetail({ id: "me", role: "admin" }, stored({ role: "owner" }), undefined, on, undefined).customize.allowed).toBe(false);
      expect(memberDetail({ id: "me", role: "admin", permissions: ["app:view", "app:manage"] }, stored(), undefined, on, undefined).customize.allowed).toBe(false);
    });

    it("offers a giver with a set of their own only what that set holds", () => {
      const giver = { id: "me", role: "admin", permissions: [...MEMBER_PERMISSIONS] satisfies MemberPermission[] };
      expect(memberDetail(giver, stored(), undefined, on, undefined).customize.grantable).toEqual(["app:view", "app:manage", "billing:manage"]);
    });

    it("allows exactly what its row says the person may change, and nothing the row refuses", () => {
      for (const status of MEMBER_STATUSES) {
        for (const role of MEMBER_ROLES) {
          for (const actorRole of MEMBER_ROLES) {
            const detail = memberDetail({ id: "me", role: actorRole }, member_(status, role), undefined, on, undefined);
            if (detail.customize.allowed) expect(detail.can.changeRole, `${actorRole} on ${status} ${role}`).toBe(true);
          }
        }
      }
    });
  });

  function member_(status: (typeof MEMBER_STATUSES)[number], role: (typeof MEMBER_ROLES)[number]) {
    return stored({ id: `${status}-${role}`, status, role });
  }
});

describe("what a person who is not a person yet may be offered", () => {
  const on = customPolicy({ enabled: true, alsoProtected: [] });
  const stored = (overrides: Partial<Parameters<typeof memberDetail>[1]> = {}) => ({
    ...memberRecord({ id: "x", name: "Ada", email: "ada@firesio.app" }),
    shopifyUserId: "4242",
    trimmedAt: null,
    collaborator: false,
    createdAt: 1_000,
    invitedBy: null,
    ...overrides,
  });

  it("never lets in or restores a row with no Shopify user, whatever its status, but still lets an invitation be cancelled", () => {
    for (const status of MEMBER_STATUSES) {
      const detail = memberDetail(owner, stored({ status, shopifyUserId: null }), undefined, on, { open: true });
      expect(detail.can.approve, `approve ${status}`).toBe(false);
      expect(detail.can.restore, `restore ${status}`).toBe(false);
      expect(detail.seat, `seat ${status}`).toBeNull();
    }
    expect(memberDetail(owner, stored({ status: "invited", shopifyUserId: null }), undefined, on, undefined).can).toMatchObject({ remove: true, changeRole: true });
  });

  it("offers letting in a waiting person, and restoring a removed one, only when there is a person", () => {
    expect(memberDetail(owner, stored({ status: "pending" }), undefined, on, undefined).can).toMatchObject({ approve: true, restore: false });
    expect(memberDetail(owner, stored({ status: "removed" }), undefined, on, undefined).can).toMatchObject({ approve: false, restore: true });
  });

  it("carries the seat answer only to someone who can be let in or brought back", () => {
    const full = { open: false, why: "full" } as const;
    expect(memberDetail(owner, stored({ status: "pending" }), undefined, on, full).seat).toEqual(full);
    expect(memberDetail(owner, stored({ status: "removed" }), undefined, on, full).seat).toEqual(full);
    expect(memberDetail(owner, stored({ status: "active" }), undefined, on, full).seat).toBeNull();
    // Someone who may not act (a member) is shown no seat note: they have no button to disable.
    expect(memberDetail({ id: "me", role: "member" }, stored({ status: "pending" }), undefined, on, full).seat).toBeNull();
  });

  it("recognises a cancelled invitation of the old kind: removed, and never linked", () => {
    expect(isCancelledInvitation({ status: "removed", linked: false })).toBe(true);
    expect(isCancelledInvitation({ status: "removed", linked: true })).toBe(false);
    expect(isCancelledInvitation({ status: "invited", linked: false })).toBe(false);
    expect(isCancelledInvitation({ status: "pending", linked: false })).toBe(false);
  });
});

describe("seats for letting someone in", () => {
  it("is open without a limit and while a seat is free, and full at and over the limit", () => {
    expect(activationSeat({ kind: "unlimited" }, 99)).toEqual({ open: true });
    expect(activationSeat({ kind: "limit", maximum: 3 }, 2)).toEqual({ open: true });
    expect(activationSeat({ kind: "limit", maximum: 3 }, 3)).toEqual({ open: false, why: "full" });
    expect(activationSeat({ kind: "limit", maximum: 3 }, 5)).toEqual({ open: false, why: "full" });
    expect(activationSeat({ kind: "limit", maximum: 0 }, 0)).toEqual({ open: false, why: "full" });
  });

  it("is closed, and says the plan could not be read, when it could not be", () => {
    expect(activationSeat({ kind: "unknown" }, 0)).toEqual({ open: false, why: "unreadable" });
  });

  it("agrees with the list's summary", () => {
    for (const reading of [{ kind: "unlimited" }, { kind: "unknown" }, { kind: "limit", maximum: 0 }, { kind: "limit", maximum: 2 }, { kind: "limit", maximum: 3 }] as const) {
      for (const used of [0, 2, 3, 6]) expect(seatsOpenIn(seatSummary(reading, used)), `${reading.kind} ${used}`).toEqual(activationSeat(reading, used));
    }
  });
});

describe("seatSummary of a plan that could not be read", () => {
  it("is unknown with the count in use, never a limit of 0 and never over", () => {
    expect(seatSummary({ kind: "unknown" }, 3)).toEqual({ kind: "unknown", used: 3 });
  });

  it("is still a real limit of 0 when the plan grants no seats", () => {
    expect(seatSummary({ kind: "limit", maximum: 0 }, 2)).toEqual({ kind: "limit", maximum: 0, used: 2, left: 0, over: 2 });
  });
});

describe("teamNotices and hiddenCount", () => {
  it("counts people waiting apart from people who lost a seat", () => {
    expect(teamNotices({ pending: 5, noSeat: 2 })).toEqual({ waiting: 3, noSeat: 2 });
    expect(teamNotices({ pending: 2, noSeat: 2 })).toEqual({ waiting: 0, noSeat: 2 });
    expect(teamNotices({ pending: 0, noSeat: 0 })).toEqual({ waiting: 0, noSeat: 0 });
  });

  it("never goes negative on counts that disagree", () => {
    expect(teamNotices({ pending: 1, noSeat: 4 }).waiting).toBe(0);
  });

  it("says how many people the capped list did not show, and none when it is whole", () => {
    const counts = { invited: 1, pending: 2, active: 600, removed: 3 };
    expect(hiddenCount(counts, 500)).toBe(106);
    expect(hiddenCount(counts, 606)).toBe(0);
    expect(hiddenCount(counts, 700)).toBe(0);
  });
});
