import { describe, expect, it } from "vitest";
import { MEMBER_ROLES, can, type MemberRole } from "./member-access";
import {
  NOTICE_HOURS_MAX,
  NOTICE_HOURS_MIN,
  decideSeatOverage,
  deadlineFor,
  noticeHoursProblem,
  noticeRecipients,
  selectTrimmed,
  type OpenEpisode,
  type OverageFacts,
  type OverageMember,
  type SeatOverageConfig,
} from "./member-seat-overage";

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;
const TRIM: SeatOverageConfig = { policy: "notify_then_trim", noticeHours: 72 };
const NEVER: SeatOverageConfig = { policy: "never_remove" };

let counter = 0;
const person = (role: MemberRole, overrides: Partial<OverageMember> = {}): OverageMember => {
  counter += 1;
  return { id: `m${String(counter).padStart(3, "0")}`, role, accountOwner: false, lastSeenAt: 1000, createdAt: 1000, ...overrides };
};

/** A team with one owner and `members` plain members: the owner is protected, so `members` are the ones a trim can reach. */
const team = (members: number): OverageMember[] => [person("owner"), ...Array.from({ length: members }, () => person("member"))];

const episode = (overrides: Partial<OpenEpisode> = {}): OpenEpisode => ({ id: "e1", detectedAt: NOW - 100 * HOUR, notifiedAt: null, deadlineAt: null, ...overrides });
const notified = (deadlineAt: number): OpenEpisode => episode({ notifiedAt: deadlineAt - 72 * HOUR, deadlineAt });

const facts = (overrides: Partial<OverageFacts> = {}): OverageFacts => ({
  installed: true,
  limit: { kind: "limit", maximum: 3 },
  active: team(4), // 5 people, limit 3: two over
  episode: undefined,
  recipients: 1,
  privilegeUnavailable: false,
  now: NOW,
  ...overrides,
});

describe("policy never_remove", () => {
  it("does nothing whatever the facts say: a plan change removes nobody", () => {
    const cases: OverageFacts[] = [
      facts(),
      facts({ episode: episode() }),
      facts({ episode: notified(NOW - HOUR) }),
      facts({ limit: { kind: "unlimited" } }),
      facts({ installed: false }),
    ];
    for (const given of cases) expect(decideSeatOverage(given, NEVER)).toEqual({ action: "none", reason: "policy_off" });
  });
});

describe("noticeHoursProblem and deadlineFor", () => {
  it.each([NOTICE_HOURS_MIN, 2, 72, NOTICE_HOURS_MAX])("accepts %s hours", (noticeHours) => {
    expect(noticeHoursProblem({ policy: "notify_then_trim", noticeHours })).toBeNull();
  });

  it.each([0, -5, NOTICE_HOURS_MAX + 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses %s hours", (noticeHours) => {
    expect(noticeHoursProblem({ policy: "notify_then_trim", noticeHours })).toContain("noticeHours");
  });

  it("has nothing to check, and no deadline, when nobody is removed", () => {
    expect(noticeHoursProblem(NEVER)).toBeNull();
    expect(deadlineFor(NEVER, NOW)).toBeNull();
  });

  it("puts the deadline the notice period after the moment the notice was handed over", () => {
    expect(deadlineFor(TRIM, NOW)).toBe(NOW + 72 * HOUR);
    expect(deadlineFor({ policy: "notify_then_trim", noticeHours: 1 }, 0)).toBe(HOUR);
  });
});

describe("opening and cancelling an episode", () => {
  it("opens one when the shop is over its limit and has none", () => {
    expect(decideSeatOverage(facts(), TRIM)).toEqual({ action: "open_episode" });
  });

  it("does nothing for a shop exactly at its limit, or under it, with no episode", () => {
    expect(decideSeatOverage(facts({ active: team(2) }), TRIM)).toEqual({ action: "none", reason: "within_limit" });
    expect(decideSeatOverage(facts({ active: team(1) }), TRIM)).toEqual({ action: "none", reason: "within_limit" });
  });

  it("cancels an open episode the moment the team is back within the limit, even after the deadline", () => {
    expect(decideSeatOverage(facts({ active: team(2), episode: episode() }), TRIM)).toEqual({ action: "cancel_episode", reason: "within_limit" });
    expect(decideSeatOverage(facts({ active: team(2), episode: notified(NOW - HOUR) }), TRIM)).toEqual({ action: "cancel_episode", reason: "within_limit" });
  });

  it("cancels when the plan is upgraded to a bigger limit before the deadline", () => {
    expect(decideSeatOverage(facts({ limit: { kind: "limit", maximum: 5 }, episode: notified(NOW + HOUR) }), TRIM)).toEqual({ action: "cancel_episode", reason: "within_limit" });
  });

  it("cancels when the plan becomes unlimited, and does nothing when there was no episode", () => {
    expect(decideSeatOverage(facts({ limit: { kind: "unlimited" }, episode: notified(NOW + HOUR) }), TRIM)).toEqual({ action: "cancel_episode", reason: "unlimited" });
    expect(decideSeatOverage(facts({ limit: { kind: "unlimited" } }), TRIM)).toEqual({ action: "none", reason: "unlimited" });
  });

  it("cancels, and never opens, for a shop the app is no longer installed on", () => {
    expect(decideSeatOverage(facts({ installed: false }), TRIM)).toEqual({ action: "none", reason: "not_installed" });
    expect(decideSeatOverage(facts({ installed: false, episode: notified(NOW - HOUR) }), TRIM)).toEqual({ action: "cancel_episode", reason: "not_installed" });
  });

  it("neither opens nor advances anything on a limit it could not read, and an open episode just waits", () => {
    expect(decideSeatOverage(facts({ limit: { kind: "unknown" } }), TRIM)).toEqual({ action: "none", reason: "limit_unknown" });
    expect(decideSeatOverage(facts({ limit: { kind: "unknown" }, episode: notified(NOW - 10 * HOUR) }), TRIM)).toEqual({ action: "wait", reason: "limit_unknown" });
    expect(decideSeatOverage(facts({ limit: { kind: "unknown" }, episode: episode() }), TRIM)).toEqual({ action: "wait", reason: "limit_unknown" });
  });

  it("opens nothing when everyone who is over is protected: nobody could be removed, so there is nothing to warn about", () => {
    const owners = [person("owner"), person("owner"), person("owner"), person("owner")];
    expect(decideSeatOverage(facts({ active: owners }), TRIM)).toEqual({ action: "none", reason: "nothing_trimmable" });
    expect(decideSeatOverage(facts({ active: owners, episode: episode() }), TRIM)).toEqual({ action: "cancel_episode", reason: "nothing_trimmable" });
  });
});

describe("the notice", () => {
  it("is sent for an open episode with nobody told yet, naming who would be removed", () => {
    const active = team(4);
    const decision = decideSeatOverage(facts({ active, episode: episode() }), TRIM);
    expect(decision).toMatchObject({ action: "send_notice", over: 2, limit: 3 });
    if (decision.action !== "send_notice") throw new Error("expected a notice");
    expect(decision.wouldTrim).toHaveLength(2);
    expect(decision.wouldTrim).toEqual(selectTrimmed(active, 3).ids);
  });

  it("is never trimmed on: a shop whose notice cannot be sent waits, with no deadline running", () => {
    const decision = decideSeatOverage(facts({ episode: episode(), recipients: 0 }), TRIM);
    expect(decision).toEqual({ action: "wait", reason: "no_recipient" });
  });

  it("stays a wait even long after the episode was opened: time alone never starts a deadline", () => {
    const old = episode({ detectedAt: NOW - 10_000 * HOUR });
    expect(decideSeatOverage(facts({ episode: old, recipients: 0 }), TRIM)).toEqual({ action: "wait", reason: "no_recipient" });
  });
});

describe("the deadline", () => {
  const over = (deadlineAt: number, extra: Partial<OverageFacts> = {}) => decideSeatOverage(facts({ episode: notified(deadlineAt), ...extra }), TRIM);

  it("waits before the deadline, however close", () => {
    expect(over(NOW + 1)).toEqual({ action: "wait", reason: "before_deadline" });
    expect(over(NOW + 72 * HOUR)).toEqual({ action: "wait", reason: "before_deadline" });
  });

  it("trims exactly at the deadline and after it", () => {
    expect(over(NOW)).toMatchObject({ action: "trim" });
    expect(over(NOW - 1)).toMatchObject({ action: "trim" });
    expect(over(NOW - 1000 * HOUR)).toMatchObject({ action: "trim" });
  });

  it("trims against the limit it was given now, and exactly active minus limit people", () => {
    const decision = over(NOW - 1, { active: team(6), limit: { kind: "limit", maximum: 4 } });
    expect(decision).toMatchObject({ action: "trim", limit: 4, shortfall: 0 });
    if (decision.action !== "trim") throw new Error("expected a trim");
    expect(decision.ids).toHaveLength(3); // 7 active, limit 4
  });

  it("never trims on a limit that was not read: it waits, whatever the deadline says", () => {
    expect(over(NOW - HOUR, { limit: { kind: "unknown" } })).toEqual({ action: "wait", reason: "limit_unknown" });
  });

  it("does not trim when the app's privilege scores could not be read: the order would be a guess", () => {
    expect(over(NOW - HOUR, { privilegeUnavailable: true })).toEqual({ action: "wait", reason: "privilege_unavailable" });
    expect(over(NOW + HOUR, { privilegeUnavailable: true })).toEqual({ action: "wait", reason: "before_deadline" });
  });

  it("keeps the deadline the people were promised when the notice period was changed since", () => {
    const longer: SeatOverageConfig = { policy: "notify_then_trim", noticeHours: 168 };
    expect(decideSeatOverage(facts({ episode: notified(NOW - 1) }), longer)).toMatchObject({ action: "trim" });
    const shorter: SeatOverageConfig = { policy: "notify_then_trim", noticeHours: 1 };
    expect(decideSeatOverage(facts({ episode: notified(NOW + 5 * HOUR) }), shorter)).toEqual({ action: "wait", reason: "before_deadline" });
  });

  it("works the deadline out from the notice time for a row that has none stored", () => {
    const missing = episode({ notifiedAt: NOW - 73 * HOUR, deadlineAt: null });
    expect(decideSeatOverage(facts({ episode: missing }), TRIM)).toMatchObject({ action: "trim" });
    const early = episode({ notifiedAt: NOW - 10 * HOUR, deadlineAt: null });
    expect(decideSeatOverage(facts({ episode: early }), TRIM)).toEqual({ action: "wait", reason: "before_deadline" });
  });

  it("cancels instead of trimming when a seat freed up after the deadline but before the review ran", () => {
    expect(decideSeatOverage(facts({ active: team(2), episode: notified(NOW - HOUR) }), TRIM)).toEqual({ action: "cancel_episode", reason: "within_limit" });
  });
});

describe("selectTrimmed: who goes first", () => {
  const ids = (members: readonly OverageMember[], limit: number) => selectTrimmed(members, limit).ids;

  it("takes viewers, then members, then admins, and never an owner", () => {
    const owner = person("owner", { id: "owner" });
    const admin = person("admin", { id: "admin" });
    const member = person("member", { id: "member" });
    const viewer = person("viewer", { id: "viewer" });
    expect(ids([owner, admin, member, viewer], 3)).toEqual(["viewer"]);
    expect(ids([owner, admin, member, viewer], 2)).toEqual(["viewer", "member"]);
    expect(ids([owner, admin, member, viewer], 1)).toEqual(["viewer", "member", "admin"]);
    expect(ids([owner, admin, member, viewer], 0)).toEqual(["viewer", "member", "admin"]);
  });

  it("takes exactly active minus limit, never more, and none when within the limit", () => {
    const members = team(9);
    expect(ids(members, 10)).toEqual([]);
    expect(ids(members, 7)).toHaveLength(3);
    expect(selectTrimmed(members, 7).shortfall).toBe(0);
  });

  it("takes the person with fewer privileges first within a role, when the app supplies scores", () => {
    const high = person("member", { id: "high", privilege: 9 });
    const low = person("member", { id: "low", privilege: 1 });
    const mid = person("member", { id: "mid", privilege: 5 });
    expect(ids([person("owner"), high, low, mid], 2)).toEqual(["low", "mid"]);
  });

  it("lets a role outrank a score: a viewer with a high score still goes before a member with a low one", () => {
    const viewer = person("viewer", { id: "viewer", privilege: 100 });
    const member = person("member", { id: "member", privilege: 0 });
    expect(ids([person("owner"), member, viewer], 2)).toEqual(["viewer"]);
  });

  it("protects somebody the app could not score, rather than trimming them first", () => {
    const unscored = person("member", { id: "unscored", lastSeenAt: null });
    const scored = person("member", { id: "scored", privilege: 50 });
    expect(ids([person("owner"), unscored, scored], 2)).toEqual(["scored"]);
  });

  it("falls back to the next tier when nobody has a score: the longest unseen goes first, never seen before all", () => {
    const never = person("member", { id: "never", lastSeenAt: null });
    const old = person("member", { id: "old", lastSeenAt: 100 });
    const recent = person("member", { id: "recent", lastSeenAt: 900 });
    expect(ids([person("owner"), recent, old, never], 3)).toEqual(["never"]);
    expect(ids([person("owner"), recent, old, never], 2)).toEqual(["never", "old"]);
    expect(ids([person("owner"), recent, old, never], 1)).toEqual(["never", "old", "recent"]);
  });

  it("then takes the newest member first when everything above ties", () => {
    const first = person("member", { id: "first", createdAt: 100 });
    const second = person("member", { id: "second", createdAt: 200 });
    const third = person("member", { id: "third", createdAt: 300 });
    expect(ids([person("owner"), first, second, third], 2)).toEqual(["third", "second"]);
  });

  it("finally orders by id, so the order is total and the same on every review", () => {
    const b = person("member", { id: "b" });
    const a = person("member", { id: "a" });
    const c = person("member", { id: "c" });
    expect(ids([person("owner"), c, a, b], 2)).toEqual(["a", "b"]);
    expect(ids([person("owner"), b, c, a], 2)).toEqual(["a", "b"]);
  });

  it("gives the same answer whatever order the team is listed in", () => {
    const members = [person("owner"), person("admin"), person("member"), person("viewer"), person("member", { lastSeenAt: null })];
    const reversed = [...members].reverse();
    expect(ids(reversed, 2)).toEqual(ids(members, 2));
  });

  it("never trims Shopify's account owner, whatever role they were given", () => {
    const store = person("admin", { id: "store", accountOwner: true });
    const viewer = person("viewer", { id: "viewer" });
    expect(ids([person("owner"), store, viewer], 1)).toEqual(["viewer"]);
    expect(selectTrimmed([person("owner"), store], 1)).toEqual({ ids: [], shortfall: 1 });
  });

  it("does not change the list it is given", () => {
    const members = team(4);
    const before = members.map((member) => member.id);
    selectTrimmed(members, 2);
    expect(members.map((member) => member.id)).toEqual(before);
  });
});

describe("selectTrimmed: the shop always keeps someone who can manage the team", () => {
  it("skips the last manager and takes the next candidate", () => {
    const admin = person("admin", { id: "admin" });
    const viewer = person("viewer", { id: "viewer" });
    const member = person("member", { id: "member" });
    // No owner: the admin is the only manager. Over by 2 of 3 people: the viewer and the member go; the admin stays.
    expect(selectTrimmed([admin, viewer, member], 1)).toEqual({ ids: ["viewer", "member"], shortfall: 0 });
  });

  it("trims what it can and leaves the rest when only the last manager would reach the limit", () => {
    const admin = person("admin", { id: "admin" });
    const viewer = person("viewer", { id: "viewer" });
    expect(selectTrimmed([admin, viewer], 0)).toEqual({ ids: ["viewer"], shortfall: 1 });
    expect(selectTrimmed([admin], 0)).toEqual({ ids: [], shortfall: 1 });
  });

  it("takes admins too, one fewer than all, when no owner holds the team", () => {
    const first = person("admin", { id: "a1", createdAt: 3 });
    const second = person("admin", { id: "a2", createdAt: 2 });
    const third = person("admin", { id: "a3", createdAt: 1 });
    expect(selectTrimmed([first, second, third], 0)).toEqual({ ids: ["a1", "a2"], shortfall: 1 });
  });

  it("can take every admin when an owner is there to keep the team managed", () => {
    const owner = person("owner");
    const admins = [person("admin", { id: "a1" }), person("admin", { id: "a2" })];
    expect(selectTrimmed([owner, ...admins], 1)).toEqual({ ids: ["a1", "a2"], shortfall: 0 });
  });

  it("keeps a manager through every role: whoever it takes, at least one holder of members:manage remains", () => {
    for (const role of MEMBER_ROLES) {
      const members = [person(role), person("admin"), person("member"), person("viewer")];
      for (let limit = 0; limit <= members.length; limit += 1) {
        const taken = new Set(selectTrimmed(members, limit).ids);
        const remaining = members.filter((member) => !taken.has(member.id));
        expect(remaining.some((member) => can(member, "members:manage")), `${role} limit ${limit}`).toBe(true);
      }
    }
  });

  it("does not count an admin who has a set of their own as a manager: the one preset admin is the last manager and stays", () => {
    const owner = person("owner");
    // Never seen, so first in line without the protection; the custom admin holds no members:manage whatever their role says.
    const manager = person("admin", { id: "manager", lastSeenAt: null });
    const limited = person("admin", { id: "limited", lastSeenAt: 5000, permissions: ["app:view", "app:manage"] });
    // The owner is protected and counts as a manager too, so two admins can go while the owner remains.
    expect(selectTrimmed([owner, manager, limited], 1).ids).toEqual(["manager", "limited"]);
    // Without the owner the preset admin is the only manager: the custom one goes, the manager stays.
    expect(selectTrimmed([manager, limited], 1)).toEqual({ ids: ["limited"], shortfall: 0 });
  });

  it("keeps a manager when everyone else has a set of their own, whatever role they were based on", () => {
    const members = [person("admin", { id: "a", permissions: ["app:view"] }), person("admin", { id: "b", permissions: ["app:view"] }), person("admin", { id: "c" })];
    for (let limit = 0; limit <= members.length; limit += 1) {
      const taken = new Set(selectTrimmed(members, limit).ids);
      expect(members.filter((member) => !taken.has(member.id)).some((member) => can(member, "members:manage")), `limit ${limit}`).toBe(true);
    }
  });

  it("leaves the shop with nothing to trim when the only ones over are protected, and says how many it could not take", () => {
    const owners = [person("owner"), person("owner"), person("owner")];
    expect(selectTrimmed(owners, 1)).toEqual({ ids: [], shortfall: 2 });
  });
});

describe("noticeRecipients", () => {
  const member = (role: MemberRole, email: string | null, name: string | null = null, permissions: OverageMember["permissions"] = null) => ({ role, email, name, permissions });
  const contact = { email: "shop@alpha.example", name: "Alpha" };

  it("is the active owners with an address", () => {
    expect(noticeRecipients([member("owner", "o@a.example", "Olu"), member("admin", "a@a.example")], contact)).toEqual([{ email: "o@a.example", name: "Olu" }]);
  });

  it("falls back to admins when no owner has an address", () => {
    expect(noticeRecipients([member("owner", null), member("owner", "  "), member("admin", "a@a.example", "Ada")], contact)).toEqual([{ email: "a@a.example", name: "Ada" }]);
  });

  it("falls back to the shop's own contact address when no owner or admin has one", () => {
    expect(noticeRecipients([member("member", "m@a.example"), member("admin", null)], contact)).toEqual([{ email: "shop@alpha.example", name: "Alpha" }]);
  });

  it("is nobody when nobody has an address and the app passed none", () => {
    expect(noticeRecipients([member("owner", null), member("viewer", "v@a.example")], null)).toEqual([]);
    expect(noticeRecipients([], { email: null, name: "Alpha" })).toEqual([]);
    expect(noticeRecipients([], { email: "   ", name: null })).toEqual([]);
  });

  it("writes each address once, lower-cased, so nobody is told twice", () => {
    expect(noticeRecipients([member("owner", "Olu@A.example", "Olu"), member("owner", "olu@a.example", "Olu again")], null)).toEqual([{ email: "olu@a.example", name: "Olu" }]);
  });

  it("never reaches someone with a set of their own, whatever role they were based on: they cannot fix a seat problem", () => {
    expect(noticeRecipients([member("owner", null), member("admin", "a@a.example", "Ada", ["app:view", "app:manage"])], contact)).toEqual([{ email: "shop@alpha.example", name: "Alpha" }]);
    expect(noticeRecipients([member("admin", "a@a.example", "Ada", ["app:view"]), member("admin", "b@a.example", "Bo")], contact)).toEqual([{ email: "b@a.example", name: "Bo" }]);
  });

  it("never reaches a member or a viewer, however many addresses there are", () => {
    expect(noticeRecipients([member("member", "m@a.example"), member("viewer", "v@a.example")], null)).toEqual([]);
  });
});
