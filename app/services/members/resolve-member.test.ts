import { describe, expect, it } from "vitest";
import type { AdmissionConfig } from "~/domain/member-admission";
import type { SeatLimit } from "~/domain/member-seats";
import { FakeMemberStore } from "~/test/fake-members";
import { fakeSeats, noSeats, seatsFor } from "~/test/fake-seats";
import { fakeClock, fakeRuntime } from "~/test/fake-runtime";
import type { MemberIdentity } from "./identity";
import { resolveMember, SEEN_REFRESH_MS, type MemberLogEntry } from "./resolve-member";

const SHOP = "alpha.myshopify.com";
const identity = (overrides: Partial<MemberIdentity> = {}): MemberIdentity => ({ shop: SHOP, shopifyUserId: "1", email: null, name: null, accountOwner: false, collaborator: false, ...overrides });

function setup(config: AdmissionConfig = { onUnknownUser: "auto_join", autoJoinRole: "member" }, limit?: SeatLimit) {
  const members = new FakeMemberStore();
  const clock = fakeClock();
  const logs: MemberLogEntry[] = [];
  const seats = fakeSeats(limit);
  const runtime = { ...fakeRuntime({ idPrefix: "m" }), clock };
  return { members, clock, logs, seats, deps: { members, seats, config, runtime, log: (entry: MemberLogEntry) => void logs.push(entry) } };
}

const POLICIES = ["auto_join", "invite_only", "approval"] as const;

describe("the first person on a store", () => {
  it.each(POLICIES)("becomes its admin, never its owner, under %s", async (onUnknownUser) => {
    const { deps, members } = setup({ onUnknownUser, autoJoinRole: "viewer" });
    const access = await resolveMember(identity(), deps);
    expect(access).toMatchObject({ ok: true, member: { role: "admin", status: "active", shopifyUserId: "1" } });
    expect(members.rows).toHaveLength(1);
    expect(members.rows.filter((row) => row.role === "owner")).toEqual([]);
  });

  it("is logged without any personal detail", async () => {
    const { deps, logs } = setup();
    await resolveMember(identity({ email: "ada@firesio.app", name: "Ada" }), deps);
    expect(logs).toEqual([{ event: "member.created", shop: SHOP, role: "admin", status: "active", reason: "first_user" }]);
  });

  it.each(POLICIES)("is admitted whatever the plan's seats say, even none at all, under %s", async (onUnknownUser) => {
    const { deps, seats } = setup({ onUnknownUser, autoJoinRole: "member" }, noSeats);
    expect(await resolveMember(identity(), deps)).toMatchObject({ ok: true, member: { role: "admin", status: "active" } });
    expect(seats.asked).toBe(0);
  });

  it("is one admin when two first requests arrive together, and the loser follows the policy", async () => {
    const { deps, members } = setup();
    members.beforeWrite = (kind) => {
      // The other request lands its admin between this one's check and its write.
      if (kind === "createFirstMemberIfNone" && members.rows.length === 0) members.add({ id: "rival", shop: SHOP, role: "admin", status: "active", shopifyUserId: "2" });
    };
    const access = await resolveMember(identity({ shopifyUserId: "1" }), deps);
    // This request lost; it asks again, finds the app opened, and is treated as a stranger under auto_join.
    expect(access).toMatchObject({ ok: true, member: { role: "member", shopifyUserId: "1" } });
    expect(members.rows.filter((row) => row.role === "admin")).toHaveLength(1);
  });

  it("is the account owner's owner row, not the first-user rule, when Shopify says they own the store", async () => {
    for (const onUnknownUser of POLICIES) {
      const { deps, logs, members } = setup({ onUnknownUser, autoJoinRole: "member" }, noSeats);
      expect(await resolveMember(identity({ accountOwner: true }), deps)).toMatchObject({ ok: true, member: { role: "owner", status: "active", accountOwner: true } });
      expect(logs).toEqual([{ event: "member.created", shop: SHOP, role: "owner", status: "active", reason: "account_owner" }]);
      expect(members.rows).toHaveLength(1);
    }
  });

  it("is not the admin when they are a collaborator: the first collaborator follows the policy", async () => {
    const auto = setup({ onUnknownUser: "auto_join", autoJoinRole: "viewer" });
    expect(await resolveMember(identity({ collaborator: true }), auto.deps)).toMatchObject({ ok: true, member: { role: "viewer", status: "active", collaborator: true } });
    expect(auto.logs).toEqual([{ event: "member.created", shop: SHOP, role: "viewer", status: "active", reason: "auto_join" }]);

    const invite = setup({ onUnknownUser: "invite_only", autoJoinRole: "viewer" });
    expect(await resolveMember(identity({ collaborator: true }), invite.deps)).toEqual({ ok: false, reason: "not_invited" });
    expect(invite.members.rows).toEqual([]);

    const approval = setup({ onUnknownUser: "approval", autoJoinRole: "viewer" });
    expect(await resolveMember(identity({ collaborator: true }), approval.deps)).toEqual({ ok: false, reason: "pending" });
    expect(approval.members.rows[0]).toMatchObject({ role: "viewer", status: "pending", collaborator: true });
  });

  it.each(["auto_join", "approval"] as const)("is not followed by a second first user once a collaborator has opened the app under %s", async (onUnknownUser) => {
    const { deps, members } = setup({ onUnknownUser, autoJoinRole: "member" });
    await resolveMember(identity({ shopifyUserId: "1", collaborator: true }), deps);
    await resolveMember(identity({ shopifyUserId: "2" }), deps);
    expect(members.rows.filter((row) => row.role === "admin")).toEqual([]);
    expect(members.rows.find((row) => row.shopifyUserId === "2")).toMatchObject(onUnknownUser === "auto_join" ? { role: "member", status: "active" } : { role: "viewer", status: "pending" });
  });

  it("is still the admin under invite_only after a collaborator was turned away: nothing was recorded, and otherwise nobody could ever invite", async () => {
    const { deps, members } = setup({ onUnknownUser: "invite_only", autoJoinRole: "member" });
    expect(await resolveMember(identity({ shopifyUserId: "1", collaborator: true }), deps)).toEqual({ ok: false, reason: "not_invited" });
    expect(await resolveMember(identity({ shopifyUserId: "2" }), deps)).toMatchObject({ ok: true, member: { role: "admin", status: "active" } });
    expect(members.rows).toHaveLength(1);
  });

  it("is never repeated once the first admin was removed: a new stranger follows the policy and the removed admin is kept out", async () => {
    for (const onUnknownUser of POLICIES) {
      const { deps, members } = setup({ onUnknownUser, autoJoinRole: "member" });
      await resolveMember(identity({ shopifyUserId: "1" }), deps);
      const index = members.rows.findIndex((row) => row.shopifyUserId === "1");
      const first = members.rows[index];
      if (first === undefined) throw new Error("the first admin was not created");
      // An owner removed them (the real store would refuse removing the last manager, so the row is set directly).
      members.rows[index] = { ...first, status: "removed" };

      const stranger = await resolveMember(identity({ shopifyUserId: "2" }), deps);
      expect(stranger).toEqual(onUnknownUser === "auto_join" ? expect.objectContaining({ ok: true, member: expect.objectContaining({ role: "member" }) }) : { ok: false, reason: onUnknownUser === "approval" ? "pending" : "not_invited" });
      expect(members.rows.filter((row) => row.role === "admin" && row.status === "active")).toEqual([]);
      expect(await resolveMember(identity({ shopifyUserId: "1" }), deps)).toEqual({ ok: false, reason: "removed" });
    }
  });
});

describe("a known member", () => {
  it("is let in with their role", async () => {
    const { deps, members } = setup();
    members.add({ id: "x", shop: SHOP, role: "admin", status: "active", shopifyUserId: "1", lastSeenAt: deps.runtime.clock.now() });
    expect(await resolveMember(identity(), deps)).toMatchObject({ ok: true, member: { id: "x", role: "admin" } });
  });

  it("is not written to on an ordinary page view", async () => {
    const { deps, members } = setup();
    members.add({ id: "x", shop: SHOP, role: "member", status: "active", shopifyUserId: "1", lastSeenAt: deps.runtime.clock.now() });
    await resolveMember(identity(), deps);
    expect(members.writes).toEqual([]);
  });

  it("has the sighting recorded once it is an hour old, and not before", async () => {
    const { deps, members, clock } = setup();
    members.add({ id: "x", shop: SHOP, role: "member", status: "active", shopifyUserId: "1", lastSeenAt: clock.now() });
    clock.advance(SEEN_REFRESH_MS - 1);
    await resolveMember(identity(), deps);
    expect(members.writes).toEqual([]);
    clock.advance(1);
    const access = await resolveMember(identity(), deps);
    expect(members.writes).toEqual(["recordSeen"]);
    expect(access.ok && access.member.lastSeenAt).toBe(clock.now());
  });

  it("has what Shopify says kept up to date at once when it changes", async () => {
    const { deps, members } = setup();
    members.add({ id: "x", shop: SHOP, role: "member", status: "active", shopifyUserId: "1", email: "old@firesio.app", lastSeenAt: deps.runtime.clock.now() });
    const access = await resolveMember(identity({ email: "new@firesio.app", name: "New Name" }), deps);
    expect(access).toMatchObject({ ok: true, member: { email: "new@firesio.app", name: "New Name" } });
    expect(members.rows[0]).toMatchObject({ email: "new@firesio.app", name: "New Name" });
  });

  it("keeps a known email when this request carries none", async () => {
    const { deps, members } = setup();
    members.add({ id: "x", shop: SHOP, role: "member", status: "active", shopifyUserId: "1", email: "a@firesio.app", lastSeenAt: null });
    await resolveMember(identity({ email: null }), deps);
    expect(members.rows[0]?.email).toBe("a@firesio.app");
  });

  it("is kept out while pending, with the reason", async () => {
    const { deps, members } = setup();
    members.add({ id: "x", shop: SHOP, role: "viewer", status: "pending", shopifyUserId: "1" });
    expect(await resolveMember(identity(), deps)).toEqual({ ok: false, reason: "pending" });
  });

  it("is kept out when removed, however open the policy", async () => {
    const { deps, members } = setup({ onUnknownUser: "auto_join", autoJoinRole: "member" });
    members.add({ id: "x", shop: SHOP, role: "owner", status: "removed", shopifyUserId: "1" });
    members.add({ id: "boss", shop: SHOP, role: "owner", status: "active", shopifyUserId: "2" });
    expect(await resolveMember(identity(), deps)).toEqual({ ok: false, reason: "removed" });
  });
});

describe("the store's own owner", () => {
  it("is made an owner when an admin already runs the store, and the admin is left as they were", async () => {
    const { deps, members } = setup({ onUnknownUser: "invite_only", autoJoinRole: "member" });
    members.add({ id: "admin", shop: SHOP, role: "admin", status: "active", shopifyUserId: "9", lastSeenAt: deps.runtime.clock.now() });
    const before = { ...members.rows[0] };
    expect(await resolveMember(identity({ shopifyUserId: "2", accountOwner: true }), deps)).toMatchObject({ ok: true, member: { role: "owner", status: "active", accountOwner: true } });
    expect(members.rows.find((row) => row.id === "admin")).toEqual(before);
  });

  it("becomes an owner again when their row is an active admin (ownership moved to them, or they were admitted earlier)", async () => {
    const { deps, members, logs } = setup({ onUnknownUser: "invite_only", autoJoinRole: "member" });
    members.add({ id: "x", shop: SHOP, role: "admin", status: "active", shopifyUserId: "1", lastSeenAt: deps.runtime.clock.now() });
    expect(await resolveMember(identity({ accountOwner: true }), deps)).toMatchObject({ ok: true, member: { id: "x", role: "owner", status: "active" } });
    expect(logs).toEqual([{ event: "member.owner_restored", shop: SHOP }]);
  });

  it("is let in as owner even when the shop already has one and the policy is invite_only", async () => {
    const { deps, members } = setup({ onUnknownUser: "invite_only", autoJoinRole: "member" });
    members.add({ id: "first", shop: SHOP, role: "owner", status: "active", shopifyUserId: "9" });
    const access = await resolveMember(identity({ shopifyUserId: "2", accountOwner: true }), deps);
    expect(access).toMatchObject({ ok: true, member: { role: "owner", accountOwner: true } });
    expect(members.rows.filter((row) => row.role === "owner")).toHaveLength(2);
  });

  it("is restored when they had been removed or lowered", async () => {
    for (const status of ["removed", "pending"] as const) {
      const { deps, members, logs } = setup({ onUnknownUser: "invite_only", autoJoinRole: "member" });
      members.add({ id: "x", shop: SHOP, role: "viewer", status, shopifyUserId: "1" });
      const access = await resolveMember(identity({ accountOwner: true }), deps);
      expect(access).toMatchObject({ ok: true, member: { id: "x", role: "owner", status: "active" } });
      expect(logs).toEqual([{ event: "member.owner_restored", shop: SHOP }]);
    }
  });
});

describe("a stranger on a shop that has an owner", () => {
  const owned = (config: AdmissionConfig) => {
    const state = setup(config);
    state.members.add({ id: "boss", shop: SHOP, role: "owner", status: "active", shopifyUserId: "9" });
    return state;
  };

  it("joins at once with the app's default role under auto_join", async () => {
    const { deps, logs } = owned({ onUnknownUser: "auto_join", autoJoinRole: "viewer" });
    expect(await resolveMember(identity({ shopifyUserId: "2" }), deps)).toMatchObject({ ok: true, member: { role: "viewer", status: "active" } });
    expect(logs).toEqual([{ event: "member.created", shop: SHOP, role: "viewer", status: "active", reason: "auto_join" }]);
  });

  it("is kept out under invite_only and nothing is written", async () => {
    const { deps, members } = owned({ onUnknownUser: "invite_only", autoJoinRole: "member" });
    expect(await resolveMember(identity({ shopifyUserId: "2", email: "x@firesio.app" }), deps)).toEqual({ ok: false, reason: "not_invited" });
    expect(members.rows).toHaveLength(1);
  });

  it("is recorded as pending and kept out under approval", async () => {
    const { deps, members } = owned({ onUnknownUser: "approval", autoJoinRole: "member" });
    expect(await resolveMember(identity({ shopifyUserId: "2" }), deps)).toEqual({ ok: false, reason: "pending" });
    expect(members.rows.find((row) => row.shopifyUserId === "2")).toMatchObject({ status: "pending", role: "viewer" });
  });

  it("is asked about once however many times they open the app while pending", async () => {
    const { deps, members } = owned({ onUnknownUser: "approval", autoJoinRole: "member" });
    await resolveMember(identity({ shopifyUserId: "2" }), deps);
    await resolveMember(identity({ shopifyUserId: "2" }), deps);
    expect(members.rows.filter((row) => row.shopifyUserId === "2")).toHaveLength(1);
  });

  it("is not duplicated when two requests for the same new person arrive together", async () => {
    const { deps, members } = owned({ onUnknownUser: "auto_join", autoJoinRole: "member" });
    members.beforeWrite = (kind) => {
      if (kind === "create" && !members.rows.some((row) => row.shopifyUserId === "2")) members.add({ id: "twin", shop: SHOP, role: "member", status: "active", shopifyUserId: "2" });
    };
    const access = await resolveMember(identity({ shopifyUserId: "2" }), deps);
    expect(access).toMatchObject({ ok: true, member: { id: "twin" } });
    expect(members.rows.filter((row) => row.shopifyUserId === "2")).toHaveLength(1);
  });

  it("belongs to one shop only: the same Shopify user is a stranger in another", async () => {
    const { deps, members } = owned({ onUnknownUser: "invite_only", autoJoinRole: "member" });
    members.add({ id: "other", shop: "beta.myshopify.com", role: "admin", status: "active", shopifyUserId: "2" });
    expect(await resolveMember(identity({ shopifyUserId: "2" }), deps)).toEqual({ ok: false, reason: "not_invited" });
  });
});

describe("invitations", () => {
  const invited = (config: AdmissionConfig, role: "admin" | "viewer" = "admin") => {
    const state = setup(config);
    state.members.add({ id: "boss", shop: SHOP, role: "owner", status: "active", shopifyUserId: "9" });
    state.members.add({ id: "inv", shop: SHOP, role, status: "invited", email: "new@firesio.app", invitedBy: "boss" });
    return state;
  };

  it.each(["auto_join", "invite_only", "approval"] as const)("let the invited person in with the invited role under %s", async (onUnknownUser) => {
    const { deps, members, logs } = invited({ onUnknownUser, autoJoinRole: "viewer" });
    const access = await resolveMember(identity({ shopifyUserId: "2", email: "new@firesio.app" }), deps);
    expect(access).toMatchObject({ ok: true, member: { id: "inv", role: "admin", status: "active", shopifyUserId: "2" } });
    expect(members.rows).toHaveLength(2);
    expect(logs).toEqual([{ event: "member.invite_accepted", shop: SHOP, role: "admin", status: "active" }]);
  });

  it("are matched only by an address Shopify verified", async () => {
    const { deps } = invited({ onUnknownUser: "invite_only", autoJoinRole: "member" });
    expect(await resolveMember(identity({ shopifyUserId: "2", email: null }), deps)).toEqual({ ok: false, reason: "not_invited" });
  });

  it("are taken up once: a second person with the same address is a stranger", async () => {
    const { deps } = invited({ onUnknownUser: "invite_only", autoJoinRole: "member" });
    await resolveMember(identity({ shopifyUserId: "2", email: "new@firesio.app" }), deps);
    expect(await resolveMember(identity({ shopifyUserId: "3", email: "new@firesio.app" }), deps)).toEqual({ ok: false, reason: "not_invited" });
  });

  it("do not apply to a shop other than the one they were written for", async () => {
    const { deps, members } = invited({ onUnknownUser: "invite_only", autoJoinRole: "member" });
    members.add({ id: "boss-b", shop: "beta.myshopify.com", role: "owner", status: "active", shopifyUserId: "8" });
    expect(await resolveMember(identity({ shop: "beta.myshopify.com", shopifyUserId: "2", email: "new@firesio.app" }), deps)).toEqual({ ok: false, reason: "not_invited" });
  });
});

describe("a store that keeps refusing a write", () => {
  it("fails loudly rather than guessing, once every attempt has lost", async () => {
    const { deps, members } = setup();
    members.add({ id: "boss", shop: SHOP, role: "owner", status: "active", shopifyUserId: "9" });
    // A broken store: it says another request always got there first, yet never shows that request's row.
    members.create = async () => ({ kind: "exists" });
    await expect(resolveMember(identity({ shopifyUserId: "2" }), deps)).rejects.toThrow(/could not settle/);
  });
});

describe("seats", () => {
  const owned = (config: AdmissionConfig, limit: SeatLimit) => {
    const state = setup(config, limit);
    state.members.add({ id: "boss", shop: SHOP, role: "owner", status: "active", shopifyUserId: "9" });
    return state;
  };

  it("lets a stranger join while the plan has a seat", async () => {
    const { deps } = owned({ onUnknownUser: "auto_join", autoJoinRole: "member" }, seatsFor(2));
    expect(await resolveMember(identity({ shopifyUserId: "2" }), deps)).toMatchObject({ ok: true, member: { status: "active" } });
  });

  it("records a stranger as pending, and says why in the log, when the plan has no seat", async () => {
    const { deps, members, logs } = owned({ onUnknownUser: "auto_join", autoJoinRole: "member" }, seatsFor(1));
    expect(await resolveMember(identity({ shopifyUserId: "2" }), deps)).toEqual({ ok: false, reason: "pending" });
    expect(members.rows.find((row) => row.shopifyUserId === "2")).toMatchObject({ status: "pending", role: "member" });
    expect(logs).toEqual([{ event: "member.created", shop: SHOP, role: "member", status: "pending", reason: "seat_limit" }]);
  });

  it("keeps the stranger who is waiting for a seat waiting, without adding a second row", async () => {
    const { deps, members } = owned({ onUnknownUser: "auto_join", autoJoinRole: "member" }, seatsFor(1));
    await resolveMember(identity({ shopifyUserId: "2" }), deps);
    expect(await resolveMember(identity({ shopifyUserId: "2" }), deps)).toEqual({ ok: false, reason: "pending" });
    expect(members.rows.filter((row) => row.shopifyUserId === "2")).toHaveLength(1);
  });

  it("takes up an invitation as pending when the plan has no seat, with the invited role kept", async () => {
    const { deps, members, logs } = owned({ onUnknownUser: "invite_only", autoJoinRole: "member" }, noSeats);
    members.add({ id: "inv", shop: SHOP, role: "admin", status: "invited", email: "new@firesio.app" });
    expect(await resolveMember(identity({ shopifyUserId: "2", email: "new@firesio.app" }), deps)).toEqual({ ok: false, reason: "pending" });
    expect(members.rows.find((row) => row.id === "inv")).toMatchObject({ status: "pending", role: "admin", shopifyUserId: "2" });
    expect(logs).toEqual([{ event: "member.invite_accepted", shop: SHOP, role: "admin", status: "pending" }]);
  });

  it("never keeps an owner waiting: the first user and the store's own owner are admitted with no seat at all", async () => {
    const first = setup({ onUnknownUser: "auto_join", autoJoinRole: "member" }, noSeats);
    expect(await resolveMember(identity(), first.deps)).toMatchObject({ ok: true, member: { role: "admin", status: "active" } });

    const owner = owned({ onUnknownUser: "invite_only", autoJoinRole: "member" }, noSeats);
    expect(await resolveMember(identity({ shopifyUserId: "2", accountOwner: true }), owner.deps)).toMatchObject({ ok: true, member: { role: "owner", status: "active" } });
  });

  it("counts an owner who arrives with the team at the limit, changes nobody, and keeps the next stranger waiting", async () => {
    const { deps, members } = setup({ onUnknownUser: "auto_join", autoJoinRole: "member" }, seatsFor(2));
    members.add({ id: "a", shop: SHOP, role: "admin", status: "active", shopifyUserId: "7", lastSeenAt: deps.runtime.clock.now() });
    members.add({ id: "b", shop: SHOP, role: "member", status: "active", shopifyUserId: "8", lastSeenAt: deps.runtime.clock.now() });
    const before = members.rows.map((row) => ({ ...row }));

    expect(await resolveMember(identity({ shopifyUserId: "2", accountOwner: true }), deps)).toMatchObject({ ok: true, member: { role: "owner", status: "active" } });
    expect(members.rows.filter((row) => row.status === "active")).toHaveLength(3);
    expect(members.rows.slice(0, 2)).toEqual(before);

    expect(await resolveMember(identity({ shopifyUserId: "3" }), deps)).toEqual({ ok: false, reason: "pending" });
    expect(members.rows.filter((row) => row.status === "active")).toHaveLength(3);
  });

  it("restores a removed account owner past a team that is over the limit", async () => {
    const { deps, members } = setup({ onUnknownUser: "invite_only", autoJoinRole: "member" }, seatsFor(1));
    members.add({ id: "a", shop: SHOP, role: "admin", status: "active", shopifyUserId: "7", lastSeenAt: deps.runtime.clock.now() });
    members.add({ id: "b", shop: SHOP, role: "member", status: "active", shopifyUserId: "8", lastSeenAt: deps.runtime.clock.now() });
    members.add({ id: "gone", shop: SHOP, role: "viewer", status: "removed", shopifyUserId: "2" });
    expect(await resolveMember(identity({ shopifyUserId: "2", accountOwner: true }), deps)).toMatchObject({ ok: true, member: { id: "gone", role: "owner", status: "active" } });
    expect(members.rows.filter((row) => row.status === "active")).toHaveLength(3);
  });

  it("is asked about the plan only when someone is about to become an active member", async () => {
    const known = owned({ onUnknownUser: "auto_join", autoJoinRole: "member" }, seatsFor(5));
    known.members.add({ id: "x", shop: SHOP, role: "member", status: "active", shopifyUserId: "2", lastSeenAt: known.clock.now() });
    await resolveMember(identity({ shopifyUserId: "2" }), known.deps);
    expect(known.seats.asked).toBe(0);

    const denied = owned({ onUnknownUser: "invite_only", autoJoinRole: "member" }, seatsFor(5));
    await resolveMember(identity({ shopifyUserId: "3" }), denied.deps);
    expect(denied.seats.asked).toBe(0);

    const first = setup(undefined, seatsFor(5));
    await resolveMember(identity(), first.deps);
    expect(first.seats.asked).toBe(0);

    const stranger = owned({ onUnknownUser: "auto_join", autoJoinRole: "member" }, seatsFor(5));
    await resolveMember(identity({ shopifyUserId: "4" }), stranger.deps);
    expect(stranger.seats.asked).toBe(1);
  });

  it("does not take a seat for a person the approval policy only records", async () => {
    const { deps, members } = owned({ onUnknownUser: "approval", autoJoinRole: "member" }, seatsFor(5));
    await resolveMember(identity({ shopifyUserId: "2" }), deps);
    expect(members.rows.find((row) => row.shopifyUserId === "2")?.status).toBe("pending");
  });
});

// Regression: a member is identified by the Shopify user id (`sub`), never by an email. Two different people on one
// store can legitimately present the same verified email (a shared mailbox, an agency login), and neither may be refused
// or take over the other's membership.
describe("two Shopify users with the same verified email", () => {
  const EMAIL = "shop@x.com";
  const auto: AdmissionConfig = { onUnknownUser: "auto_join", autoJoinRole: "viewer" };

  it("admits the second one as a new member with the default role when no invitation exists, leaving the first untouched", async () => {
    const { deps, members } = setup(auto);
    members.add({ id: "boss", shop: SHOP, role: "owner", status: "active", shopifyUserId: "9" });
    members.add({ id: "a", shop: SHOP, role: "admin", status: "active", shopifyUserId: "1", email: EMAIL, lastSeenAt: deps.runtime.clock.now() });
    const before = { ...members.rows.find((row) => row.id === "a") };

    const access = await resolveMember(identity({ shopifyUserId: "2", email: EMAIL }), deps);

    expect(access).toMatchObject({ ok: true, member: { shopifyUserId: "2", role: "viewer", status: "active" } });
    expect(members.rows.find((row) => row.id === "a")).toEqual(before);
    expect(members.rows.filter((row) => row.email === EMAIL)).toHaveLength(2);
  });

  it("admits the second one when the invitation to that address was already taken up by the first, without taking over its membership", async () => {
    const { deps, members } = setup(auto);
    members.add({ id: "boss", shop: SHOP, role: "owner", status: "active", shopifyUserId: "9" });
    members.add({ id: "inv", shop: SHOP, role: "admin", status: "invited", email: EMAIL, invitedBy: "boss" });

    await resolveMember(identity({ shopifyUserId: "1", email: EMAIL }), deps);
    const first = { ...members.rows.find((row) => row.id === "inv") };
    expect(first).toMatchObject({ shopifyUserId: "1", status: "active", role: "admin" });

    const access = await resolveMember(identity({ shopifyUserId: "2", email: EMAIL }), deps);

    expect(access).toMatchObject({ ok: true, member: { shopifyUserId: "2", role: "viewer", status: "active" } });
    expect(access.ok && access.member.id).not.toBe("inv");
    expect(members.rows.find((row) => row.id === "inv")).toEqual(first);
  });
});

describe("the store's own owner with a different user id than the existing owner", () => {
  it.each(["auto_join", "invite_only", "approval"] as const)("gets in as owner under %s while the existing owner keeps theirs", async (onUnknownUser) => {
    const { deps, members } = setup({ onUnknownUser, autoJoinRole: "member" });
    members.add({ id: "first", shop: SHOP, role: "owner", status: "active", shopifyUserId: "9" });
    const before = { ...members.rows.find((row) => row.id === "first") };

    const access = await resolveMember(identity({ shopifyUserId: "2", accountOwner: true }), deps);

    expect(access).toMatchObject({ ok: true, member: { shopifyUserId: "2", role: "owner", status: "active" } });
    expect(members.rows.find((row) => row.id === "first")).toEqual(before);
    expect(members.rows.filter((row) => row.role === "owner" && row.status === "active")).toHaveLength(2);
  });
});

describe("a shop with no members at all", () => {
  it("makes the first person its admin and the second, who is not the account owner, a member", async () => {
    const { deps, members } = setup({ onUnknownUser: "auto_join", autoJoinRole: "member" });
    expect(members.rows).toHaveLength(0);

    expect(await resolveMember(identity({ shopifyUserId: "1" }), deps)).toMatchObject({ ok: true, member: { shopifyUserId: "1", role: "admin" } });
    expect(await resolveMember(identity({ shopifyUserId: "2" }), deps)).toMatchObject({ ok: true, member: { shopifyUserId: "2", role: "member" } });
    expect(members.rows.filter((row) => row.role === "owner")).toEqual([]);
  });
});

describe("a removed member", () => {
  it("stays out under every policy, and is let back in only when they are the store's account owner", async () => {
    for (const onUnknownUser of ["auto_join", "invite_only", "approval"] as const) {
      const { deps, members } = setup({ onUnknownUser, autoJoinRole: "member" });
      members.add({ id: "boss", shop: SHOP, role: "owner", status: "active", shopifyUserId: "9" });
      members.add({ id: "gone", shop: SHOP, role: "member", status: "removed", shopifyUserId: "1", email: "gone@x.com" });

      expect(await resolveMember(identity({ shopifyUserId: "1", email: "gone@x.com" }), deps)).toEqual({ ok: false, reason: "removed" });
      expect(members.rows.find((row) => row.id === "gone")?.status).toBe("removed");

      expect(await resolveMember(identity({ shopifyUserId: "1", accountOwner: true }), deps)).toMatchObject({
        ok: true,
        member: { id: "gone", role: "owner", status: "active" },
      });
    }
  });
});
