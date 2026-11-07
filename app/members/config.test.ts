import { describe, expect, it } from "vitest";
import { MEMBER_ROLES } from "~/domain/member-access";
import { FLOOR_PERMISSION } from "~/domain/member-permissions";
import { UNKNOWN_USER_POLICIES } from "~/domain/member-admission";
import { MEMBERS, memberConfigProblems, type MembersConfig } from "./config";

describe("the shipped configuration", () => {
  it("is sound", () => {
    expect(memberConfigProblems(MEMBERS)).toEqual([]);
  });

  it("is the default the template documents: strangers join as members, online tokens on", () => {
    expect(MEMBERS).toEqual({ onUnknownUser: "auto_join", autoJoinRole: "member", onlineTokens: true, seatOverage: { policy: "never_remove" }, customPermissions: { enabled: false, alsoProtected: [] } });
  });

  it("removes nobody by default: a plan change never costs anyone a seat until the app opts in", () => {
    expect(MEMBERS.seatOverage).toEqual({ policy: "never_remove" });
  });
});

describe("memberConfigProblems", () => {
  const base: MembersConfig = { onUnknownUser: "auto_join", autoJoinRole: "member", onlineTokens: true, seatOverage: { policy: "never_remove" }, customPermissions: { enabled: false, alsoProtected: [] } };

  it("refuses invite_only without online tokens: no email, nobody can be matched to an invitation", () => {
    expect(memberConfigProblems({ ...base, onUnknownUser: "invite_only", onlineTokens: false })).toHaveLength(1);
    expect(memberConfigProblems({ ...base, onUnknownUser: "invite_only", onlineTokens: true })).toEqual([]);
  });

  it.each(UNKNOWN_USER_POLICIES.filter((policy) => policy !== "invite_only"))("allows %s without online tokens", (onUnknownUser) => {
    expect(memberConfigProblems({ ...base, onUnknownUser, onlineTokens: false })).toEqual([]);
  });

  it("refuses to hand strangers a role that can manage members or the plan", () => {
    const accepted = MEMBER_ROLES.filter((autoJoinRole) => memberConfigProblems({ ...base, autoJoinRole }).length === 0);
    expect(accepted).toEqual(["member", "viewer"]);
  });

  it.each(["admin", "owner"] as const)("reports autoJoinRole %s: it carries the team and the plan", (autoJoinRole) => {
    const problems = memberConfigProblems({ ...base, autoJoinRole });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`"${autoJoinRole}"`);
    expect(problems[0]).toContain("members:manage");
    expect(problems[0]).toContain("billing:manage");
  });
});

describe("seatOverage", () => {
  const base: MembersConfig = { onUnknownUser: "auto_join", autoJoinRole: "member", onlineTokens: true, seatOverage: { policy: "never_remove" }, customPermissions: { enabled: false, alsoProtected: [] } };
  const trimming = (noticeHours: number): MembersConfig => ({ ...base, seatOverage: { policy: "notify_then_trim", noticeHours } });

  it.each([1, 24, 72, 168])("accepts a notice period of %s hours", (noticeHours) => {
    expect(memberConfigProblems(trimming(noticeHours))).toEqual([]);
  });

  it.each([0, -1, 169, 1000, 1.5, 0.5, Number.NaN, Number.POSITIVE_INFINITY])("reports a notice period of %s hours", (noticeHours) => {
    const problems = memberConfigProblems(trimming(noticeHours));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("seatOverage.noticeHours");
  });

  it("asks nothing of noticeHours when nobody is removed", () => {
    expect(memberConfigProblems({ ...base, seatOverage: { policy: "never_remove" } })).toEqual([]);
  });
});

describe("customPermissions", () => {
  const base: MembersConfig = { onUnknownUser: "auto_join", autoJoinRole: "member", onlineTokens: true, seatOverage: { policy: "never_remove" }, customPermissions: { enabled: false, alsoProtected: [] } };
  const custom = (alsoProtected: MembersConfig["customPermissions"]["alsoProtected"]): MembersConfig => ({ ...base, customPermissions: { enabled: true, alsoProtected } });

  it("is off in the shipped configuration: a merchant picks a role, and nothing else is stored", () => {
    expect(MEMBERS.customPermissions.enabled).toBe(false);
  });

  it("is sound on, with nothing extra protected or with the plan protected", () => {
    expect(memberConfigProblems(custom([]))).toEqual([]);
    expect(memberConfigProblems(custom(["billing:manage"]))).toEqual([]);
  });

  it("reports protecting the way in: every set carries it, so no set could ever be given", () => {
    const problems = memberConfigProblems(custom([FLOOR_PERMISSION]));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("customPermissions.alsoProtected");
    expect(problems[0]).toContain(FLOOR_PERMISSION);
  });

  it("says nothing about it while the app does not let merchants give a set", () => {
    expect(memberConfigProblems({ ...base, customPermissions: { enabled: false, alsoProtected: [FLOOR_PERMISSION] } })).toEqual([]);
  });
});
