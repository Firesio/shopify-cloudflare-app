import { decideAdmission, type Admission, type AdmissionConfig, type DenyReason } from "~/domain/member-admission";
import { seatCapOf } from "~/domain/member-seats";
import type { Member, MemberProfile, MemberStore, NewMember, SeatCap } from "~/ports/members";
import type { MemberSeats } from "~/ports/member-seats";
import type { Runtime } from "~/ports/runtime";
import type { MemberIdentity } from "./identity";

export interface MemberDependencies {
  readonly members: MemberStore;
  /** How many active members the plan allows; asked only when someone is about to become one. */
  readonly seats: MemberSeats;
  readonly config: AdmissionConfig;
  readonly runtime: Pick<Runtime, "clock" | "ids">;
  readonly log: (entry: MemberLogEntry) => void | Promise<void>;
}

/** What is worth a line in the log: who joined and how, never an address or a name. */
export type MemberLogEntry =
  | { readonly event: "member.created"; readonly shop: string; readonly role: Member["role"]; readonly status: Member["status"]; readonly reason: string }
  | { readonly event: "member.invite_accepted"; readonly shop: string; readonly role: Member["role"]; readonly status: Member["status"] }
  | { readonly event: "member.owner_restored"; readonly shop: string }
  /** A change to the team by a member: `by` is that member's id (an opaque uuid), so the log says who did it. */
  | { readonly event: "member.role_changed" | "member.removed" | "member.approved" | "member.restored"; readonly shop: string; readonly role: Member["role"]; readonly by: string };

export type MemberAccess =
  | { readonly ok: true; readonly member: Member }
  | { readonly ok: false; readonly reason: DenyReason };

/** A page view is not a write: the sighting is recorded at most this often per person, unless their profile changed. */
export const SEEN_REFRESH_MS = 60 * 60 * 1000;

/** Two requests for the same new person can both find no row; one loses the write and asks again. Three is generous. */
const MAX_ATTEMPTS = 3;

function profileOf(identity: MemberIdentity): MemberProfile {
  return { email: identity.email, name: identity.name, accountOwner: identity.accountOwner, collaborator: identity.collaborator };
}

/**
 * Who is this Shopify user in this shop, and may they come in?
 *
 * Gathers the facts, asks the pure rules (`decideAdmission`), carries the decision out, and returns the member or the
 * reason they were kept out. Safe to run twice at once for the same person: every write either wins or reports that
 * another request got there first, and the loser reads again. Never throws for a person who is simply not allowed.
 *
 * Seats: owners are never kept waiting. Anyone else who would become active does so only while the plan has a free seat,
 * checked in the same statement that writes; otherwise they are recorded as `pending`, where an owner can see them.
 */
export async function resolveMember(identity: MemberIdentity, deps: MemberDependencies): Promise<MemberAccess> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const outcome = await admit(identity, deps);
    if (outcome !== "retry") return outcome;
  }
  throw new Error("could not settle a member's access: every attempt lost a race it should have won once");
}

async function admit(identity: MemberIdentity, deps: MemberDependencies): Promise<MemberAccess | "retry"> {
  const { members } = deps;
  const existing = await members.findByUserId(identity.shop, identity.shopifyUserId);
  // An invitation is only ever matched for someone with no membership yet, and only by an address Shopify verified.
  const invite = existing === undefined && identity.email !== null ? await members.findInviteByEmail(identity.shop, identity.email) : undefined;
  const shopHasOwner = existing !== undefined || (await members.hasActiveOwner(identity.shop));

  const decision = decideAdmission(
    {
      member: existing && { status: existing.status, role: existing.role },
      invite: invite && { role: invite.role },
      isAccountOwner: identity.accountOwner,
      shopHasOwner,
    },
    deps.config,
  );
  return carryOut(decision, { identity, existing, invite }, deps);
}

interface Situation {
  readonly identity: MemberIdentity;
  readonly existing: Member | undefined;
  readonly invite: Member | undefined;
}

async function carryOut(decision: Admission, situation: Situation, deps: MemberDependencies): Promise<MemberAccess | "retry"> {
  const { identity, existing, invite } = situation;
  const now = deps.runtime.clock.now();
  switch (decision.action) {
    case "allow":
      return existing ? { ok: true, member: await keepCurrent(existing, identity, deps) } : "retry";
    case "restore_owner": {
      const restored = existing && (await deps.members.restoreOwner(identity.shop, existing.id, profileOf(identity), now));
      if (!restored) return "retry";
      await deps.log({ event: "member.owner_restored", shop: identity.shop });
      return { ok: true, member: restored };
    }
    case "create": {
      const person = { ...profileOf(identity), id: deps.runtime.ids.uuid(), shopifyUserId: identity.shopifyUserId, now };
      const created = await createMember(identity.shop, decision, person, deps);
      if (!created) return "retry";
      // An active member was asked for and the plan had no seat: they wait, and the log says why.
      const reason = decision.status === "active" && created.status === "pending" ? "seat_limit" : decision.reason;
      await deps.log({ event: "member.created", shop: identity.shop, role: created.role, status: created.status, reason });
      return created.status === "active" ? { ok: true, member: created } : { ok: false, reason: "pending" };
    }
    case "accept_invite": {
      const cap = await capFor(identity.shop, deps);
      const accepted = invite && (await deps.members.acceptInvite(identity.shop, invite.id, { shopifyUserId: identity.shopifyUserId, profile: profileOf(identity), now }, cap));
      if (!accepted) return "retry";
      await deps.log({ event: "member.invite_accepted", shop: identity.shop, role: accepted.role, status: accepted.status });
      return accepted.status === "active" ? { ok: true, member: accepted } : { ok: false, reason: "pending" };
    }
    case "deny":
      return { ok: false, reason: decision.reason };
    default:
      return assertNever(decision);
  }
}

/** The cap for a write that makes someone active: the plan's, read now. */
async function capFor(shop: string, deps: MemberDependencies): Promise<SeatCap> {
  return seatCapOf(await deps.seats.limit(shop));
}

/**
 * Owners are never kept waiting for a seat: the first user is added only while the shop has no owner, and the store's own
 * Shopify account owner is added whatever the plan says. Anyone else is added within the plan's seats, or `pending`.
 */
async function createMember(
  shop: string,
  decision: Extract<Admission, { readonly action: "create" }>,
  person: Omit<NewMember, "role" | "status">,
  deps: MemberDependencies,
): Promise<Member | undefined> {
  if (decision.reason === "first_user") return deps.members.createOwnerIfNone(shop, person);
  const cap = decision.role === "owner" ? null : await capFor(shop, deps);
  const outcome = await deps.members.create(shop, { ...person, role: decision.role, status: decision.status }, cap);
  return outcome.kind === "created" ? outcome.member : undefined;
}

/** Keeps what Shopify says about a member on their row, writing only when it changed or the last sighting is old. */
async function keepCurrent(member: Member, identity: MemberIdentity, deps: MemberDependencies): Promise<Member> {
  const now = deps.runtime.clock.now();
  const profile = profileOf(identity);
  const changed =
    (profile.email !== null && profile.email !== member.email) ||
    (profile.name !== null && profile.name !== member.name) ||
    profile.accountOwner !== member.accountOwner ||
    profile.collaborator !== member.collaborator;
  const stale = member.lastSeenAt === null || now - member.lastSeenAt >= SEEN_REFRESH_MS;
  if (!changed && !stale) return member;
  await deps.members.recordSeen(identity.shop, member.id, profile, now);
  return {
    ...member,
    email: profile.email ?? member.email,
    name: profile.name ?? member.name,
    accountOwner: profile.accountOwner,
    collaborator: profile.collaborator,
    lastSeenAt: now,
  };
}

function assertNever(value: never): never {
  throw new Error(`unhandled admission: ${JSON.stringify(value)}`);
}
