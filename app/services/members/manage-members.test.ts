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
