import { describe, expect, it } from "vitest";
import { MEMBER_ROLES, type MemberRole } from "~/domain/member-access";
import type { SeatLimit } from "~/domain/member-seats";
import { FakeMemberStore } from "~/test/fake-members";
import { fakeSeats, noSeats, seatsFor } from "~/test/fake-seats";
import { fakeClock } from "~/test/fake-runtime";
import { approveMember, changeRole, removeMember, restoreMember, type Actor, type ManageDependencies } from "./manage-members";
import type { MemberLogEntry } from "./resolve-member";

const SHOP = "alpha.myshopify.com";
const owner: Actor = { id: "owner", shop: SHOP, role: "owner" };
const admin: Actor = { id: "admin", shop: SHOP, role: "admin" };

function setup(limit?: SeatLimit) {
  const members = new FakeMemberStore();
  members.add({ id: "owner", shop: SHOP, role: "owner", status: "active", shopifyUserId: "1" });
  members.add({ id: "admin", shop: SHOP, role: "admin", status: "active", shopifyUserId: "2" });
  members.add({ id: "mem", shop: SHOP, role: "member", status: "active", shopifyUserId: "3" });
  members.add({ id: "wait", shop: SHOP, role: "viewer", status: "pending", shopifyUserId: "4" });
  members.add({ id: "gone", shop: SHOP, role: "member", status: "removed", shopifyUserId: "5" });
  members.add({ id: "inv", shop: SHOP, role: "viewer", status: "invited", email: "i@firesio.app" });
  const logs: MemberLogEntry[] = [];
  const seats = fakeSeats(limit);
  const deps: ManageDependencies = { members, seats, runtime: { clock: fakeClock() }, log: (entry) => void logs.push(entry) };
  return { members, logs, seats, deps };
}
const statusOf = (members: FakeMemberStore, id: string) => members.rows.find((row) => row.id === id)?.status;
const roleOf = (members: FakeMemberStore, id: string) => members.rows.find((row) => row.id === id)?.role;

describe("what every action refuses", () => {
  const actions = {
    changeRole: (actor: Actor, deps: ManageDependencies, targetId = "mem") => changeRole({ actor, targetId, role: "viewer" }, deps),
    removeMember: (actor: Actor, deps: ManageDependencies, targetId = "mem") => removeMember({ actor, targetId }, deps),
    approveMember: (actor: Actor, deps: ManageDependencies, targetId = "wait") => approveMember({ actor, targetId, role: "viewer" }, deps),
    restoreMember: (actor: Actor, deps: ManageDependencies, targetId = "gone") => restoreMember({ actor, targetId, role: "member" }, deps),
  };

  it.each(Object.entries(actions))("%s: an actor without members:manage is forbidden, and nothing changes", async (_name, run) => {
    for (const role of ["member", "viewer"] as const) {
      const { deps, members } = setup();
      const before = JSON.stringify(members.rows);
      expect(await run({ id: "x", shop: SHOP, role }, deps)).toEqual({ ok: false, reason: "forbidden" });
      expect(JSON.stringify(members.rows)).toBe(before);
      expect(members.writes).toEqual([]);
    }
  });

  it.each(Object.entries(actions))("%s: a member who does not exist is not found", async (_name, run) => {
    const { deps } = setup();
    expect(await run(owner, deps, "nobody")).toEqual({ ok: false, reason: "notFound" });
  });

  it.each(Object.entries(actions))("%s: a member of another shop is not found", async (_name, run) => {
    const { deps, members } = setup();
    members.add({ id: "foreign", shop: "beta.myshopify.com", role: "member", status: "pending", shopifyUserId: "9" });
    expect(await run(owner, deps, "foreign")).toEqual({ ok: false, reason: "notFound" });
    expect(statusOf(members, "foreign")).toBe("pending");
  });

  it.each(Object.entries(actions))("%s: nobody acts on themselves", async (_name, run) => {
    const { deps } = setup();
    expect(await run(owner, deps, "owner")).toEqual({ ok: false, reason: "notYourself" });
  });

  it.each(Object.entries(actions))("%s: an admin cannot touch an owner", async (_name, run) => {
    const { deps, members } = setup();
    members.add({ id: "boss2", shop: SHOP, role: "owner", status: "active", shopifyUserId: "7" });
    expect(await run(admin, deps, "boss2")).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("changeRole", () => {
  it("changes a role and logs it without any personal detail", async () => {
    const { deps, members, logs } = setup();
    const result = await changeRole({ actor: owner, targetId: "mem", role: "admin" }, deps);
    expect(result).toMatchObject({ ok: true, value: { id: "mem", role: "admin" } });
    expect(roleOf(members, "mem")).toBe("admin");
    expect(logs).toEqual([{ event: "member.role_changed", shop: SHOP, role: "admin", by: "owner" }]);
  });

  it("does nothing, and logs nothing, when the role is already that one", async () => {
    const { deps, members, logs } = setup();
    expect(await changeRole({ actor: owner, targetId: "mem", role: "member" }, deps)).toMatchObject({ ok: true });
    expect(members.writes).toEqual([]);
    expect(logs).toEqual([]);
  });

  it("never lets an admin hand out a role above their own", async () => {
    const { deps, members } = setup();
    expect(await changeRole({ actor: admin, targetId: "mem", role: "owner" }, deps)).toEqual({ ok: false, reason: "forbidden" });
    expect(roleOf(members, "mem")).toBe("member");
  });

  it("lets an admin change a member to any role they hold themselves", async () => {
    const { deps } = setup();
    for (const role of MEMBER_ROLES.filter((role): role is Exclude<MemberRole, "owner"> => role !== "owner")) {
      expect(await changeRole({ actor: admin, targetId: "mem", role }, deps)).toMatchObject({ ok: true });
    }
  });

  it("refuses to take the last active owner's role, with the reason", async () => {
    const { deps, members } = setup();
    // Someone else acts as an owner on the shop's one active owner, who is the target.
    members.add({ id: "second", shop: SHOP, role: "admin", status: "active", shopifyUserId: "8" });
    const actor: Actor = { id: "second", shop: SHOP, role: "owner" };
    expect(await changeRole({ actor, targetId: "owner", role: "admin" }, deps)).toEqual({ ok: false, reason: "lastOwner" });
    expect(roleOf(members, "owner")).toBe("owner");
  });

  it("allows demoting an owner while another remains", async () => {
    const { deps, members } = setup();
    members.add({ id: "boss2", shop: SHOP, role: "owner", status: "active", shopifyUserId: "7" });
    expect(await changeRole({ actor: owner, targetId: "boss2", role: "admin" }, deps)).toMatchObject({ ok: true });
  });

  it("refuses a removed member: restore them first", async () => {
    const { deps } = setup();
    expect(await changeRole({ actor: owner, targetId: "gone", role: "admin" }, deps)).toEqual({ ok: false, reason: "invalidState" });
  });

  it("can set the role of someone waiting, or of an invitation", async () => {
    const { deps, members } = setup();
    expect(await changeRole({ actor: owner, targetId: "wait", role: "member" }, deps)).toMatchObject({ ok: true });
    expect(await changeRole({ actor: owner, targetId: "inv", role: "admin" }, deps)).toMatchObject({ ok: true });
    expect(roleOf(members, "inv")).toBe("admin");
  });
});

describe("removeMember", () => {
  it.each([
    ["an active member", "mem"],
    ["a member waiting for approval", "wait"],
    ["an invitation nobody took up", "inv"],
  ])("removes %s and logs it", async (_name, id) => {
    const { deps, members, logs } = setup();
    expect(await removeMember({ actor: owner, targetId: id }, deps)).toMatchObject({ ok: true, value: { status: "removed" } });
    expect(statusOf(members, id)).toBe("removed");
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ event: "member.removed", shop: SHOP, by: "owner" });
  });

  it("refuses to remove someone already removed", async () => {
    const { deps } = setup();
    expect(await removeMember({ actor: owner, targetId: "gone" }, deps)).toEqual({ ok: false, reason: "invalidState" });
  });

  it("refuses to remove the last active owner, and allows it once another exists", async () => {
    const { deps, members } = setup();
    const second: Actor = { id: "second", shop: SHOP, role: "owner" };
    members.add({ id: "second", shop: SHOP, role: "admin", status: "active", shopifyUserId: "8" });
    expect(await removeMember({ actor: second, targetId: "owner" }, deps)).toEqual({ ok: false, reason: "lastOwner" });
    members.add({ id: "boss2", shop: SHOP, role: "owner", status: "active", shopifyUserId: "7" });
    expect(await removeMember({ actor: second, targetId: "owner" }, deps)).toMatchObject({ ok: true });
  });

  it("frees the seat: a removed member no longer counts as active", async () => {
    const { deps, members } = setup();
    await removeMember({ actor: owner, targetId: "mem" }, deps);
    expect((await members.countByStatus(SHOP)).active).toBe(2);
  });
});

describe("approveMember", () => {
  it("lets a waiting person in with the role chosen", async () => {
    const { deps, members, logs } = setup(seatsFor(10));
    expect(await approveMember({ actor: owner, targetId: "wait", role: "member" }, deps)).toMatchObject({ ok: true, value: { status: "active", role: "member" } });
    expect(statusOf(members, "wait")).toBe("active");
    expect(logs).toEqual([{ event: "member.approved", shop: SHOP, role: "member", by: "owner" }]);
  });

  it("refuses when the plan has no free seat, and leaves them waiting", async () => {
    const { deps, members } = setup(seatsFor(3));
    expect(await approveMember({ actor: owner, targetId: "wait", role: "viewer" }, deps)).toEqual({ ok: false, reason: "noSeat" });
    expect(statusOf(members, "wait")).toBe("pending");
  });

  it("lets them in when a seat has been freed", async () => {
    const { deps } = setup(seatsFor(3));
    await removeMember({ actor: owner, targetId: "mem" }, deps);
    expect(await approveMember({ actor: owner, targetId: "wait", role: "viewer" }, deps)).toMatchObject({ ok: true });
  });

  it("refuses a role above the approver's own", async () => {
    const { deps, members } = setup();
    expect(await approveMember({ actor: admin, targetId: "wait", role: "owner" }, deps)).toEqual({ ok: false, reason: "forbidden" });
    expect(statusOf(members, "wait")).toBe("pending");
  });

  it.each([
    ["an active member", "mem"],
    ["a removed member", "gone"],
    ["an invitation", "inv"],
  ])("refuses %s: only a waiting person is approved", async (_name, id) => {
    const { deps } = setup();
    expect(await approveMember({ actor: owner, targetId: id, role: "viewer" }, deps)).toEqual({ ok: false, reason: "invalidState" });
  });

  it("asks the plan once, only when it gets as far as activating", async () => {
    const { deps, seats } = setup();
    await approveMember({ actor: owner, targetId: "mem", role: "viewer" }, deps);
    expect(seats.asked).toBe(0);
    await approveMember({ actor: owner, targetId: "wait", role: "viewer" }, deps);
    expect(seats.asked).toBe(1);
  });

  it("is refused when someone else approved them first", async () => {
    const { deps, members } = setup();
    const original = members.activate.bind(members);
    members.activate = async (shop, id, input) => {
      // Between this request's read and its write, another owner approves the same person.
      members.rows.splice(members.rows.findIndex((row) => row.id === "wait"), 1, { ...members.rows.find((row) => row.id === "wait")!, status: "active" });
      return original(shop, id, input);
    };
    expect(await approveMember({ actor: owner, targetId: "wait", role: "viewer" }, deps)).toEqual({ ok: false, reason: "invalidState" });
  });
});

describe("restoreMember", () => {
  it("brings a removed member back with the role chosen", async () => {
    const { deps, members, logs } = setup();
    expect(await restoreMember({ actor: owner, targetId: "gone", role: "viewer" }, deps)).toMatchObject({ ok: true, value: { status: "active", role: "viewer" } });
    expect(statusOf(members, "gone")).toBe("active");
    expect(logs).toEqual([{ event: "member.restored", shop: SHOP, role: "viewer", by: "owner" }]);
  });

  it("refuses when there is no seat", async () => {
    const { deps, members } = setup(noSeats);
    expect(await restoreMember({ actor: owner, targetId: "gone", role: "member" }, deps)).toEqual({ ok: false, reason: "noSeat" });
    expect(statusOf(members, "gone")).toBe("removed");
  });

  it("refuses anyone who is not removed", async () => {
    const { deps } = setup();
    for (const id of ["mem", "wait", "inv"]) {
      expect(await restoreMember({ actor: owner, targetId: id, role: "member" }, deps)).toEqual({ ok: false, reason: "invalidState" });
    }
  });
});

describe("an admin and an owner are different roles", () => {
  const ownerRow = (members: FakeMemberStore, status: "active" | "pending" | "removed") =>
    members.add({ id: `owner-${status}`, shop: SHOP, role: "owner", status, shopifyUserId: `o-${status}` });

  it.each(["active", "pending", "removed"] as const)("never lets an admin change, remove, approve or restore an owner who is %s", async (status) => {
    const { deps, members } = setup();
    ownerRow(members, status);
    const targetId = `owner-${status}`;
    const before = JSON.stringify(members.rows);
    expect(await changeRole({ actor: admin, targetId, role: "member" }, deps)).toEqual({ ok: false, reason: "forbidden" });
    expect(await changeRole({ actor: admin, targetId, role: "admin" }, deps)).toEqual({ ok: false, reason: "forbidden" });
    expect(await removeMember({ actor: admin, targetId }, deps)).toEqual({ ok: false, reason: "forbidden" });
    expect(await approveMember({ actor: admin, targetId, role: "viewer" }, deps)).toEqual({ ok: false, reason: "forbidden" });
    expect(await restoreMember({ actor: admin, targetId, role: "viewer" }, deps)).toEqual({ ok: false, reason: "forbidden" });
    expect(JSON.stringify(members.rows)).toBe(before);
    expect(members.writes).toEqual([]);
  });

  it("never lets an admin make anyone an owner, whoever the target is", async () => {
    const { deps, members } = setup();
    for (const targetId of ["mem", "admin2"]) {
      members.add({ id: "admin2", shop: SHOP, role: "admin", status: "active", shopifyUserId: "20" });
      expect(await changeRole({ actor: admin, targetId, role: "owner" }, deps)).toEqual({ ok: false, reason: "forbidden" });
    }
    expect(await approveMember({ actor: admin, targetId: "wait", role: "owner" }, deps)).toEqual({ ok: false, reason: "forbidden" });
    expect(await restoreMember({ actor: admin, targetId: "gone", role: "owner" }, deps)).toEqual({ ok: false, reason: "forbidden" });
    expect(roleOf(members, "mem")).toBe("member");
  });

  it("lets an admin manage other admins and members: change a role, remove, approve, restore", async () => {
    const { deps, members } = setup();
    members.add({ id: "admin2", shop: SHOP, role: "admin", status: "active", shopifyUserId: "20" });
    expect(await changeRole({ actor: admin, targetId: "admin2", role: "member" }, deps)).toMatchObject({ ok: true, value: { role: "member" } });
    expect(await changeRole({ actor: admin, targetId: "mem", role: "admin" }, deps)).toMatchObject({ ok: true, value: { role: "admin" } });
    expect(await approveMember({ actor: admin, targetId: "wait", role: "admin" }, deps)).toMatchObject({ ok: true, value: { role: "admin" } });
    expect(await restoreMember({ actor: admin, targetId: "gone", role: "admin" }, deps)).toMatchObject({ ok: true, value: { role: "admin" } });
    expect(await removeMember({ actor: admin, targetId: "admin2" }, deps)).toMatchObject({ ok: true });
  });

  it("still stops an admin acting on themselves", async () => {
    const { deps } = setup();
    expect(await changeRole({ actor: admin, targetId: "admin", role: "member" }, deps)).toEqual({ ok: false, reason: "notYourself" });
    expect(await removeMember({ actor: admin, targetId: "admin" }, deps)).toEqual({ ok: false, reason: "notYourself" });
  });

  it.each(["active", "pending", "removed"] as const)("lets an owner do all of it to an owner who is %s", async (status) => {
    const { deps, members } = setup();
    ownerRow(members, status);
    const targetId = `owner-${status}`;
    if (status === "active") {
      expect(await changeRole({ actor: owner, targetId, role: "admin" }, deps)).toMatchObject({ ok: true });
      expect(await changeRole({ actor: owner, targetId, role: "owner" }, deps)).toMatchObject({ ok: true, value: { role: "owner" } });
      expect(await removeMember({ actor: owner, targetId }, deps)).toMatchObject({ ok: true });
    } else if (status === "pending") {
      expect(await approveMember({ actor: owner, targetId, role: "owner" }, deps)).toMatchObject({ ok: true, value: { role: "owner", status: "active" } });
    } else {
      expect(await restoreMember({ actor: owner, targetId, role: "owner" }, deps)).toMatchObject({ ok: true, value: { role: "owner", status: "active" } });
    }
  });

  it("lets an owner make an owner", async () => {
    const { deps } = setup();
    expect(await changeRole({ actor: owner, targetId: "mem", role: "owner" }, deps)).toMatchObject({ ok: true, value: { role: "owner" } });
  });
});

describe("a shop always keeps someone who can manage the team", () => {
  /** Two admins and no owner: a valid shop. */
  function admins() {
    const members = new FakeMemberStore();
    members.add({ id: "a1", shop: SHOP, role: "admin", status: "active", shopifyUserId: "1" });
    members.add({ id: "a2", shop: SHOP, role: "admin", status: "active", shopifyUserId: "2" });
    members.add({ id: "m", shop: SHOP, role: "member", status: "active", shopifyUserId: "3" });
    const logs: MemberLogEntry[] = [];
    const deps: ManageDependencies = { members, seats: fakeSeats(), runtime: { clock: fakeClock() }, log: (entry) => void logs.push(entry) };
    return { members, deps, logs };
  }
  const a1: Actor = { id: "a1", shop: SHOP, role: "admin" };
  const a2: Actor = { id: "a2", shop: SHOP, role: "admin" };

  it("is valid for a shop to have no owner at all: admins run it, remove each other's members and one another", async () => {
    const { deps, members } = admins();
    expect(await removeMember({ actor: a1, targetId: "m" }, deps)).toMatchObject({ ok: true });
    expect(await removeMember({ actor: a1, targetId: "a2" }, deps)).toMatchObject({ ok: true });
    expect(statusOf(members, "a2")).toBe("removed");
  });

  it("refuses two admins who remove each other at once: exactly one lands and the other is told why", async () => {
    const { deps, members } = admins();
    const results = await Promise.all([removeMember({ actor: a1, targetId: "a2" }, deps), removeMember({ actor: a2, targetId: "a1" }, deps)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toEqual({ ok: false, reason: "lastManager" });
    expect(members.rows.filter((row) => row.role === "admin" && row.status === "active")).toHaveLength(1);
  });

  it("refuses two admins who demote each other at once", async () => {
    const { deps, members } = admins();
    const results = await Promise.all([changeRole({ actor: a1, targetId: "a2", role: "viewer" }, deps), changeRole({ actor: a2, targetId: "a1", role: "viewer" }, deps)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toEqual({ ok: false, reason: "lastManager" });
    expect(members.rows.filter((row) => row.role === "admin" && row.status === "active")).toHaveLength(1);
  });

  it("refuses to remove or demote the only admin of a shop with no owner, when the actor was removed in the meantime", async () => {
    const { deps, members } = admins();
    members.beforeWrite = (kind) => {
      if (kind === "remove" || kind === "setRole") members.rows.splice(members.rows.findIndex((row) => row.id === "a1"), 1, { ...members.rows.find((row) => row.id === "a1")!, status: "removed" });
      members.beforeWrite = undefined;
    };
    expect(await removeMember({ actor: a1, targetId: "a2" }, deps)).toEqual({ ok: false, reason: "lastManager" });
    expect(statusOf(members, "a2")).toBe("active");
  });

  it("lets an admin be removed while an owner remains", async () => {
    const { deps, members } = setup();
    expect(await removeMember({ actor: owner, targetId: "admin" }, deps)).toMatchObject({ ok: true });
    expect(statusOf(members, "admin")).toBe("removed");
  });

  it("lets the last admin become an owner, and an owner become an admin while another owner stays", async () => {
    const { deps, members } = admins();
    await removeMember({ actor: a1, targetId: "a2" }, deps);
    const solo: Actor = { id: "boss", shop: SHOP, role: "owner" };
    expect(await changeRole({ actor: solo, targetId: "a1", role: "owner" }, deps)).toMatchObject({ ok: true, value: { role: "owner" } });
    expect(roleOf(members, "a1")).toBe("owner");
  });

  it("does not count a pending or removed admin as someone who can still manage the team", async () => {
    const { deps, members } = admins();
    members.add({ id: "p", shop: SHOP, role: "admin", status: "pending", shopifyUserId: "4" });
    members.add({ id: "r", shop: SHOP, role: "admin", status: "removed", shopifyUserId: "5" });
    await removeMember({ actor: a1, targetId: "a2" }, deps);
    expect(await removeMember({ actor: { id: "x", shop: SHOP, role: "admin" }, targetId: "a1" }, deps)).toEqual({ ok: false, reason: "lastManager" });
  });

  it("keeps the last owner rule: with a lone owner and an admin, the owner stays an owner", async () => {
    const { deps, members } = setup();
    members.add({ id: "second", shop: SHOP, role: "admin", status: "active", shopifyUserId: "8" });
    const actor: Actor = { id: "second", shop: SHOP, role: "owner" };
    expect(await changeRole({ actor, targetId: "owner", role: "admin" }, deps)).toEqual({ ok: false, reason: "lastOwner" });
    expect(await changeRole({ actor, targetId: "owner", role: "member" }, deps)).toEqual({ ok: false, reason: "lastOwner" });
    expect(await removeMember({ actor, targetId: "owner" }, deps)).toEqual({ ok: false, reason: "lastOwner" });
  });
});
