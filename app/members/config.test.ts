import { describe, expect, it } from "vitest";
import { MEMBER_ROLES } from "~/domain/member-access";
import { UNKNOWN_USER_POLICIES } from "~/domain/member-admission";
import { MEMBERS, memberConfigProblems, type MembersConfig } from "./config";

describe("the shipped configuration", () => {
  it("is sound", () => {
    expect(memberConfigProblems(MEMBERS)).toEqual([]);
  });

  it("is the default the template documents: strangers join as members, online tokens on", () => {
    expect(MEMBERS).toEqual({ onUnknownUser: "auto_join", autoJoinRole: "member", onlineTokens: true });
  });
});

describe("memberConfigProblems", () => {
  const base: MembersConfig = { onUnknownUser: "auto_join", autoJoinRole: "member", onlineTokens: true };

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
});
