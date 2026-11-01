import { describe, expect, it } from "vitest";
import { MEMBER_ROLES } from "~/domain/member-access";
import { FakeMemberStore } from "~/test/fake-members";
import { fakeRuntime } from "~/test/fake-runtime";
import { inviteMember } from "./invite-member";

const SHOP = "alpha.myshopify.com";
const runtime = () => fakeRuntime({ idPrefix: "inv" });
const actor = (role: (typeof MEMBER_ROLES)[number]) => ({ id: "a1", shop: SHOP, role });

describe("inviteMember", () => {
  it("writes an invitation for the address, lower-cased, naming who asked", async () => {
    const members = new FakeMemberStore();
    const result = await inviteMember({ actor: actor("owner"), email: "  New@Firesio.app ", role: "member" }, { members, runtime: runtime() });
    expect(result).toMatchObject({ ok: true, value: { shop: SHOP, email: "new@firesio.app", role: "member", status: "invited", invitedBy: "a1", shopifyUserId: null } });
    expect(members.rows).toHaveLength(1);
  });

  it("lets an owner invite every role", async () => {
    const members = new FakeMemberStore();
    for (const role of MEMBER_ROLES) {
      const result = await inviteMember({ actor: actor("owner"), email: `${role}@firesio.app`, role }, { members, runtime: runtime() });
      expect(result.ok).toBe(true);
    }
  });

  it("refuses a role above the inviter's own, and writes nothing", async () => {
    const members = new FakeMemberStore();
    const result = await inviteMember({ actor: actor("admin"), email: "x@firesio.app", role: "owner" }, { members, runtime: runtime() });
    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(members.rows).toEqual([]);
  });

  it.each(["member", "viewer"] as const)("refuses an inviter whose role cannot manage members (%s)", async (role) => {
    const members = new FakeMemberStore();
    const result = await inviteMember({ actor: actor(role), email: "x@firesio.app", role: "viewer" }, { members, runtime: runtime() });
    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  it.each(["", "nobody", "a@b", "a b@firesio.app", "@firesio.app"])("refuses the address %j", async (email) => {
    const members = new FakeMemberStore();
    expect(await inviteMember({ actor: actor("owner"), email, role: "member" }, { members, runtime: runtime() })).toEqual({ ok: false, reason: "emailInvalid" });
    expect(members.rows).toEqual([]);
  });

  it("refuses an address that already belongs to a member or an open invitation, in any case", async () => {
    const members = new FakeMemberStore();
    members.add({ id: "m1", shop: SHOP, role: "member", status: "active", shopifyUserId: "1", email: "here@firesio.app" });
    members.add({ id: "i1", shop: SHOP, role: "viewer", status: "invited", email: "asked@firesio.app" });
    for (const email of ["HERE@firesio.app", "asked@Firesio.app"]) {
      expect(await inviteMember({ actor: actor("owner"), email, role: "member" }, { members, runtime: runtime() })).toEqual({ ok: false, reason: "alreadyMember" });
    }
    expect(members.rows).toHaveLength(2);
  });

  it("allows asking again for someone who was removed", async () => {
    const members = new FakeMemberStore();
    members.add({ id: "m1", shop: SHOP, role: "member", status: "removed", shopifyUserId: "1", email: "gone@firesio.app" });
    expect((await inviteMember({ actor: actor("owner"), email: "gone@firesio.app", role: "member" }, { members, runtime: runtime() })).ok).toBe(true);
  });

  it("does not see another shop's members when checking for a duplicate", async () => {
    const members = new FakeMemberStore();
    members.add({ id: "m1", shop: "beta.myshopify.com", role: "member", status: "active", shopifyUserId: "1", email: "x@firesio.app" });
    expect((await inviteMember({ actor: actor("owner"), email: "x@firesio.app", role: "member" }, { members, runtime: runtime() })).ok).toBe(true);
  });
});
