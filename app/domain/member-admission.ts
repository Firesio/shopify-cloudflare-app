import type { MemberRole } from "./member-access";
import type { MemberStatus } from "./member-lifecycle";

/**
 * Who gets in when a Shopify user opens the app. PURE: facts in, one decision out, so every rule is testable with no
 * database and no framework. The service (`services/members`) gathers the facts and carries the decision out.
 *
 * Two layers, in this order:
 *
 *   1. RULES THAT NEVER CHANGE, whatever an app chooses:
 *        - a known active member is let in;
 *        - the store's Shopify account owner always gets in as owner (nobody is locked out of their own store);
 *        - the first person to open the app on a store becomes its owner, so the installer is the first member;
 *        - a member someone REMOVED stays out, however open the app's policy is, until someone restores them.
 *   2. THE APP'S POLICY for everyone else (`onUnknownUser`), one function per value in UNKNOWN_USER_POLICIES.
 *
 * Adding a policy: a value in UNKNOWN_USER_POLICIES and an entry in UNKNOWN_USER. The compiler names the one forgotten.
 */
export const UNKNOWN_USER_POLICIES = ["auto_join", "invite_only", "approval"] as const;
export type UnknownUserPolicy = (typeof UNKNOWN_USER_POLICIES)[number];

export function isUnknownUserPolicy(value: string): value is UnknownUserPolicy {
  return UNKNOWN_USER_POLICIES.some((policy) => policy === value);
}

/** The app's choices; the shipped values live in `app/members/config.ts`. */
export interface AdmissionConfig {
  readonly onUnknownUser: UnknownUserPolicy;
  /** The role someone gets when the policy lets them join by themselves. Never `owner`: see `memberConfigProblems`. */
  readonly autoJoinRole: MemberRole;
}

/** What is known right now about the person opening the app. */
export interface AdmissionFacts {
  /** This Shopify user's membership in this shop, if there is one. */
  readonly member: { readonly status: MemberStatus; readonly role: MemberRole } | undefined;
  /** An open invitation addressed to this person's VERIFIED email, if there is one. */
  readonly invite: { readonly role: MemberRole } | undefined;
  /** Shopify says this user owns the store. */
  readonly isAccountOwner: boolean;
  /** The shop already has an active owner. */
  readonly shopHasOwner: boolean;
}

/** Why someone was kept out. They are shown a message for each, so it is a closed union. */
export type DenyReason = "pending" | "removed" | "not_invited";

/** Everything that can keep someone out of a page: not being let in at all, or being let in without that permission. */
export type AccessRefusal = DenyReason | "forbidden";

const ACCESS_REFUSALS: readonly AccessRefusal[] = ["pending", "removed", "not_invited", "forbidden"];

/** A real guard for the error boundary: the value arrives in a response body, so it is not trusted to be one of ours. */
export function isAccessRefusal(value: unknown): value is AccessRefusal {
  return ACCESS_REFUSALS.some((reason) => reason === value);
}

export type CreateReason = "first_user" | "account_owner" | "auto_join" | "approval";

export type Admission =
  /** Already an active member. */
  | { readonly action: "allow" }
  /** A known member becomes an active owner again (the Shopify account owner, who cannot be locked out). */
  | { readonly action: "restore_owner" }
  /** A new membership for this Shopify user. */
  | { readonly action: "create"; readonly role: MemberRole; readonly status: "active" | "pending"; readonly reason: CreateReason }
  /** An open invitation is taken up: it is linked to this Shopify user and becomes active. */
  | { readonly action: "accept_invite"; readonly role: MemberRole }
  | { readonly action: "deny"; readonly reason: DenyReason };

type PolicyDecision = (facts: AdmissionFacts, config: AdmissionConfig) => Admission;

/** Keyed by the union: a policy cannot exist unimplemented, and an unknown stored value cannot reach this table. */
export const UNKNOWN_USER: Readonly<Record<UnknownUserPolicy, PolicyDecision>> = {
  // The person is simply in, with the default role. An invitation, if there is one, still gives the role it names.
  auto_join: (facts, config) =>
    facts.invite
      ? { action: "accept_invite", role: facts.invite.role }
      : { action: "create", role: config.autoJoinRole, status: "active", reason: "auto_join" },
  // Only someone asked for by email gets in; everyone else is told to ask.
  invite_only: (facts) => (facts.invite ? { action: "accept_invite", role: facts.invite.role } : { action: "deny", reason: "not_invited" }),
  // The person is recorded and waits to be let in. An invitation skips the wait: it already is the answer.
  approval: (facts) =>
    facts.invite
      ? { action: "accept_invite", role: facts.invite.role }
      : { action: "create", role: "viewer", status: "pending", reason: "approval" },
};

/** The one decision. */
export function decideAdmission(facts: AdmissionFacts, config: AdmissionConfig): Admission {
  const { member } = facts;

  if (member) {
    // The store's own owner is never locked out, not by a pending row and not by a removal.
    if (facts.isAccountOwner && (member.status !== "active" || member.role !== "owner")) return { action: "restore_owner" };
    if (member.status === "active") return { action: "allow" };
    if (member.status === "removed") return { action: "deny", reason: "removed" };
    // `pending`, or an `invited` row that somehow carries a user (it cannot, but a row outlives the code that wrote it).
    return { action: "deny", reason: "pending" };
  }

  if (facts.isAccountOwner) return { action: "create", role: "owner", status: "active", reason: "account_owner" };
  if (!facts.shopHasOwner) return { action: "create", role: "owner", status: "active", reason: "first_user" };

  return UNKNOWN_USER[config.onUnknownUser](facts, config);
}
